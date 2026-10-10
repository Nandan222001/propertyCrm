"""Billing: tax invoices, line items, GST maths, lifecycle, settlement, sharing.

Domain rules:
* totals are always recomputed server-side from the line items — a client can
  never dictate the billed amount, only the quantity/rate/discount inputs;
* an invoice moves DRAFT → ISSUED → PARTIALLY_PAID → PAID (or OVERDUE);
  only drafts are editable; settled invoices can never be silently cancelled;
* a collection against an invoice flows through the payments ledger
  (:class:`app.services.payment_service.PaymentService`) so the booking's paid
  amount, the numbered receipt and the audit trail stay the single source of
  truth — the invoice then records the same amount as ``amount_paid``;
* collections are additionally capped by the booking's outstanding balance
  (the contract value), which the ledger already enforces.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.constants import (
    INVOICE_PAYMENT_TERM_DAYS,
    AuditAction,
    InvoiceStatus,
    Permission,
)
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, PermissionDeniedError
from app.core.responses import Paginated
from app.models.billing import Invoice, InvoiceItem, InvoiceStatusHistory
from app.repositories.billing_repository import InvoiceRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.customer_repository import CustomerRepository
from app.schemas.billing import (
    BillingSummary,
    InvoiceCancel,
    InvoiceCreate,
    InvoiceHistoryEntry,
    InvoiceIssue,
    InvoiceItemIn,
    InvoiceItemResponse,
    InvoicePaymentCreate,
    InvoiceResponse,
    InvoiceUpdate,
)
from app.schemas.finance import PaymentCreate
from app.services.base_service import BaseService
from app.services.company_profile import company_profile
from app.services.payment_service import PaymentService
from app.utils.money import amount_in_words

PAISE = Decimal("0.01")


def compute_totals(
    items: list[InvoiceItemIn],
    *,
    discount_amount: Decimal,
    gst_rate: Decimal,
) -> dict[str, Decimal]:
    """The one implementation of the invoice arithmetic (mirrored by the SPA).

    ``subtotal`` is the sum of discounted line totals; the invoice-level
    discount then yields the ``taxable_value``; GST is split into equal
    CGST/SGST halves; the grand total is rounded to the whole rupee with the
    adjustment booked as ``round_off``.
    """
    subtotal = sum(
        (
            (item.quantity * item.unit_price - item.discount_amount).quantize(PAISE)
            for item in items
        ),
        Decimal("0"),
    ).quantize(PAISE)
    discount = min(Decimal(discount_amount or 0), subtotal)
    taxable = (subtotal - discount).quantize(PAISE)
    gst = (taxable * Decimal(gst_rate or 0)).quantize(PAISE, rounding=ROUND_HALF_UP)
    cgst = (gst / 2).quantize(PAISE, rounding=ROUND_HALF_UP)
    sgst = (gst - cgst).quantize(PAISE)
    exact_total = taxable + gst
    rounded_total = exact_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return {
        "subtotal": subtotal,
        "discount_amount": discount,
        "taxable_value": taxable,
        "gst_amount": gst,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "round_off": (rounded_total - exact_total).quantize(PAISE),
        "total_amount": rounded_total,
    }


class BillingService(BaseService[Invoice]):
    resource = "invoice"
    repository_class = InvoiceRepository
    permissions = {
        "view": (Permission.INVOICE_VIEW_ALL, Permission.INVOICE_VIEW_OWN),
        "create": Permission.INVOICE_CREATE,
        "update": Permission.INVOICE_UPDATE,
        "delete": Permission.INVOICE_CANCEL,
        "issue": Permission.INVOICE_ISSUE,
        "cancel": Permission.INVOICE_CANCEL,
        "share": Permission.RECEIPT_MANAGE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.invoices: InvoiceRepository = self.repository  # type: ignore[assignment]
        self.bookings = BookingRepository(db)
        self.customers = CustomerRepository(db)

    # -------------------------------------------------------------- scoping
    def scope_clause(self):
        if self.actor.can(Permission.INVOICE_VIEW_ALL):
            return None
        if self.actor.is_customer_portal:
            return self.invoices.scope_clause_for(customer_id=self.actor.customer_id, agent_id=None)
        return self.invoices.scope_clause_for(customer_id=None, agent_id=self.actor.agent_id)

    def _scoped_or_403(self, invoice: Invoice) -> Invoice:
        """Row-level check for callers without the view-all permission."""
        if self.actor.can(Permission.INVOICE_VIEW_ALL):
            return invoice
        if self.actor.is_customer_portal and invoice.customer_id == self.actor.customer_id:
            return invoice
        raise PermissionDeniedError("This invoice belongs to another customer")

    # ----------------------------------------------------------------- read
    def paginate(self, page: PaginationContext) -> Paginated[Invoice]:
        self._authorise("view")
        return self.invoices.paginate(
            page=page.page, page_size=page.page_size, search=page.search, sort=page.sort,
            filters=page.filters, scope_clause=self.scope_clause(),
        )

    def get_invoice(self, invoice_id: int) -> Invoice:
        self._authorise("view")
        invoice = self.invoices.get_or_404(invoice_id)
        return self._scoped_or_403(invoice)

    def serialise(self, invoice: Invoice) -> InvoiceResponse:
        today = date.today()
        return InvoiceResponse(
            id=invoice.id,
            public_id=invoice.public_id,
            invoice_number=invoice.invoice_number,
            booking_id=invoice.booking_id,
            booking_number=invoice.booking.booking_number if invoice.booking else None,
            customer_id=invoice.customer_id,
            customer_name=invoice.customer.name if invoice.customer else None,
            agent_name=invoice.agent.name if invoice.agent else None,
            project_name=invoice.booking.project.name if invoice.booking and invoice.booking.project else None,
            plot_number=invoice.booking.plot.plot_number if invoice.booking and invoice.booking.plot else None,
            issue_date=invoice.issue_date,
            due_date=invoice.due_date,
            status=invoice.status,
            subtotal=invoice.subtotal,
            discount_amount=invoice.discount_amount,
            taxable_value=invoice.taxable_value,
            gst_rate=invoice.gst_rate,
            gst_amount=invoice.gst_amount,
            cgst_amount=invoice.cgst_amount,
            sgst_amount=invoice.sgst_amount,
            round_off=invoice.round_off,
            total_amount=invoice.total_amount,
            amount_paid=invoice.amount_paid,
            balance_amount=invoice.balance_amount,
            item_count=len(invoice.items),
            items=[
                InvoiceItemResponse.model_validate(item, from_attributes=True) for item in invoice.items
            ],
            history=[
                InvoiceHistoryEntry.model_validate(entry, from_attributes=True)
                # newest first — the relationship order is only applied on load
                for entry in sorted(invoice.history, key=lambda entry: entry.id, reverse=True)
            ],
            notes=invoice.notes,
            terms=invoice.terms,
            is_shared_with_customer=invoice.is_shared_with_customer,
            cancellation_reason=invoice.cancellation_reason,
            issued_at=invoice.issued_at,
            days_overdue=(
                (today - invoice.due_date).days
                if invoice.status == InvoiceStatus.OVERDUE.value and invoice.due_date else 0
            ),
            created_at=invoice.created_at,
            updated_at=invoice.updated_at,
        )

    def summary(self) -> BillingSummary:
        self._authorise("view")
        return BillingSummary(**self.invoices.summary(scope_clause=self.scope_clause()))

    # --------------------------------------------------------------- create
    def create_invoice(self, payload: InvoiceCreate) -> Invoice:
        self._authorise("create")
        booking = self.bookings.get_or_404(payload.booking_id)
        if booking.status in ("CANCELLED", "REJECTED"):
            raise BusinessRuleError("Bills can only be raised against live bookings")

        issue_date = payload.issue_date or date.today()
        totals = compute_totals(
            payload.items, discount_amount=payload.discount_amount, gst_rate=payload.gst_rate
        )
        invoice = Invoice(
            invoice_number=self.invoices.next_number(year=issue_date.year),
            booking_id=booking.id,
            customer_id=booking.customer_id,
            agent_id=booking.agent_id,
            issue_date=issue_date,
            due_date=payload.due_date,
            status=InvoiceStatus.DRAFT.value,
            gst_rate=payload.gst_rate,
            notes=payload.notes,
            terms=payload.terms,
            created_by_id=self.actor.user_id,
            balance_amount=totals["total_amount"],
            **totals,
        )
        self._replace_items(invoice, payload.items)
        self.invoices.create(invoice)
        self._record_history(invoice, None, InvoiceStatus.DRAFT.value, reason="Invoice created")
        self._audit(AuditAction.CREATE, invoice, after={
            "invoice": invoice.invoice_number, "total": str(invoice.total_amount),
            "booking": booking.booking_number, "items": len(payload.items),
        }, summary=f"Invoice {invoice.invoice_number} drafted for ₹{invoice.total_amount:,.0f}")
        return invoice

    # --------------------------------------------------------------- update
    def update_invoice(self, invoice_id: int, payload: InvoiceUpdate) -> Invoice:
        self._authorise("update")
        invoice = self.get_invoice(invoice_id)
        if invoice.status != InvoiceStatus.DRAFT.value:
            raise BusinessRuleError("Only draft invoices can be edited — reissue a new bill instead")

        changes: dict = {}
        if payload.issue_date is not None:
            changes["issue_date"] = payload.issue_date
        if payload.due_date is not None:
            changes["due_date"] = payload.due_date
        if payload.notes is not None or payload.terms is not None:
            if payload.notes is not None:
                changes["notes"] = payload.notes
            if payload.terms is not None:
                changes["terms"] = payload.terms
        if payload.gst_rate is not None:
            changes["gst_rate"] = payload.gst_rate

        items = payload.items or [
            InvoiceItemIn(
                description=item.description,
                hsn_sac=item.hsn_sac,
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                discount_amount=item.discount_amount,
            )
            for item in invoice.items
        ]
        discount = (
            payload.discount_amount if payload.discount_amount is not None else invoice.discount_amount
        )
        gst_rate = payload.gst_rate if payload.gst_rate is not None else invoice.gst_rate
        provisional_subtotal = sum(
            ((item.quantity * item.unit_price - item.discount_amount) for item in items), Decimal("0")
        ).quantize(PAISE)
        if discount > provisional_subtotal:
            raise BusinessRuleError("Invoice discount cannot exceed the subtotal")
        totals = compute_totals(items, discount_amount=discount, gst_rate=gst_rate)
        self._replace_items(invoice, items)
        changes.update(totals)
        changes["discount_amount"] = totals["discount_amount"]
        changes["balance_amount"] = max(
            totals["total_amount"] - invoice.amount_paid, Decimal("0")
        )
        self.invoices.update(invoice, changes)
        self._audit(AuditAction.UPDATE, invoice, after={
            "invoice": invoice.invoice_number, "total": str(invoice.total_amount),
        }, summary=f"Draft {invoice.invoice_number} updated to ₹{invoice.total_amount:,.0f}")
        return invoice

    # -------------------------------------------------------------- lifecycle
    def issue_invoice(self, invoice_id: int, payload: InvoiceIssue) -> Invoice:
        self._authorise("issue")
        invoice = self.get_invoice(invoice_id)
        if invoice.status != InvoiceStatus.DRAFT.value:
            raise BusinessRuleError(
                f"Only drafts can be issued — this invoice is {invoice.status}"
            )
        invoice.status = InvoiceStatus.ISSUED.value
        invoice.issued_by_id = self.actor.user_id
        from app.db.base import utcnow

        invoice.issued_at = utcnow()
        if payload.due_date:
            invoice.due_date = payload.due_date
        elif invoice.due_date is None:
            invoice.due_date = invoice.issue_date + timedelta(days=INVOICE_PAYMENT_TERM_DAYS)
        if payload.notes:
            invoice.notes = payload.notes
        self.db.flush()
        self._record_history(
            invoice, InvoiceStatus.DRAFT.value, InvoiceStatus.ISSUED.value,
            reason=f"Issued · payment due {invoice.due_date:%d %b %Y}",
        )
        self._audit(AuditAction.INVOICE_ISSUED, invoice, after={
            "invoice": invoice.invoice_number, "due_date": str(invoice.due_date),
        }, summary=f"Invoice {invoice.invoice_number} issued for ₹{invoice.total_amount:,.0f}")
        return invoice

    def cancel_invoice(self, invoice_id: int, payload: InvoiceCancel) -> Invoice:
        self._authorise("cancel")
        invoice = self.get_invoice(invoice_id)
        if invoice.status in InvoiceStatus.settled():
            raise BusinessRuleError(
                f"An invoice that is {invoice.status} cannot be cancelled"
            )
        if invoice.amount_paid > 0:
            raise BusinessRuleError(
                f"₹{invoice.amount_paid:,.2f} was already collected against this invoice — "
                "issue a credit note instead of cancelling"
            )
        from app.db.base import utcnow

        from_status = invoice.status
        invoice.status = InvoiceStatus.CANCELLED.value
        invoice.cancellation_reason = payload.reason
        invoice.cancelled_by_id = self.actor.user_id
        invoice.cancelled_at = utcnow()
        invoice.balance_amount = Decimal("0")
        self.db.flush()
        self._record_history(
            invoice, from_status, InvoiceStatus.CANCELLED.value, reason=payload.reason
        )
        self._audit(AuditAction.INVOICE_CANCELLED, invoice, after={
            "invoice": invoice.invoice_number, "reason": payload.reason,
        }, summary=f"Invoice {invoice.invoice_number} cancelled: {payload.reason}")
        return invoice

    def mark_overdue(self) -> dict:
        """Scheduled sweep (cron or the finance desk) — flips past-due bills."""
        if not self.actor.is_authenticated or not self.actor.can(Permission.INVOICE_ISSUE):
            raise PermissionDeniedError("Only the billing desk may run the overdue sweep")
        updated = self.invoices.mark_overdue()
        self.record_custom_audit(
            AuditAction.UPDATE,
            resource_id="bulk",
            summary=f"Marked {updated} invoices overdue",
        )
        return {"overdue_marked": updated}

    # ------------------------------------------------------------- settlement
    def record_payment(self, invoice_id: int, payload: InvoicePaymentCreate) -> Invoice:
        """Collect against an invoice through the payments ledger."""
        invoice = self.get_invoice(invoice_id)
        if invoice.status not in InvoiceStatus.payable():
            raise BusinessRuleError(
                f"This invoice is {invoice.status} — no collection can be recorded"
            )
        if payload.amount > invoice.balance_amount:
            raise BusinessRuleError(
                f"Amount exceeds the invoice balance of ₹{invoice.balance_amount:,.2f}"
            )
        booking = self.bookings.get_or_404(invoice.booking_id)
        if payload.amount > booking.balance:
            raise BusinessRuleError(
                f"Amount exceeds the booking's outstanding balance of ₹{booking.balance:,.2f} "
                "(collections are capped by the contract value)"
            )

        payment_service = PaymentService(self.db, self.actor)
        payment = payment_service.record_payment(
            PaymentCreate(
                booking_id=invoice.booking_id,
                amount=payload.amount,
                mode=payload.mode,
                reference=payload.reference,
                received_on=payload.received_on,
                notes=payload.notes or f"Against invoice {invoice.invoice_number}",
            )
        )
        # Tie the ledger row to this bill, then settle the invoice side.
        payment.invoice_id = invoice.id

        invoice.amount_paid = (invoice.amount_paid + payload.amount).quantize(PAISE)
        invoice.balance_amount = max(invoice.total_amount - invoice.amount_paid, Decimal("0"))
        from_status = invoice.status
        invoice.status = (
            InvoiceStatus.PAID.value if invoice.balance_amount <= 0 else InvoiceStatus.PARTIALLY_PAID.value
        )
        self.db.flush()
        self._record_history(
            invoice, from_status, invoice.status,
            reason=f"₹{payload.amount:,.2f} collected via {payload.mode}",
        )
        self._audit(AuditAction.UPDATE, invoice, after={
            "invoice": invoice.invoice_number, "collected": str(payload.amount),
            "balance": str(invoice.balance_amount), "receipt": payment.receipt.receipt_number if payment.receipt else "-",
        }, summary=f"₹{payload.amount:,.0f} collected on invoice {invoice.invoice_number}")
        return invoice

    def payments_against(self, invoice: Invoice) -> list:
        """Ledger rows explicitly settled against this bill (for the PDF/statement)."""
        from app.models.payment import Payment

        return list(
            self.db.query(Payment)
            .filter(Payment.invoice_id == invoice.id, Payment.is_deleted == 0)
            .order_by(Payment.received_on.asc())
            .all()
        )

    # ---------------------------------------------------------------- sharing
    def share_invoice(self, invoice_id: int) -> Invoice:
        """Flag the bill as shared with the customer portal/WhatsApp; audited."""
        self._authorise("share")
        invoice = self.get_invoice(invoice_id)
        from app.db.base import utcnow

        invoice.is_shared_with_customer = True
        invoice.shared_at = utcnow()
        self.db.flush()
        self._audit(AuditAction.INVOICE_SHARED, invoice,
                    summary=f"Invoice {invoice.invoice_number} shared with the customer")
        return invoice

    # -------------------------------------------------------------------- pdf
    def pdf_payload(self, invoice: Invoice) -> dict:
        """Everything the PDF renderer needs (PII masked unless revealed)."""
        customer = self.customers.get_or_404(invoice.customer_id)
        pii = self.customers.decrypt_pii(customer)
        reveal = self.actor.can(Permission.PII_REVEAL) or self.actor.customer_id == customer.id
        booking = invoice.booking

        def _plain(value) -> str | None:
            """2400.00 → '2400' (trailing zeros only confuse the property strip)."""
            if value is None:
                return None
            text = format(value, "f") if hasattr(value, "__float__") else str(value)
            return text.rstrip("0").rstrip(".") if "." in text else text

        return {
            "invoice": self.serialise(invoice).model_dump(),
            "customer": {
                "name": customer.name,
                "email": pii["email"] if reveal else "***",
                "phone": pii["phone"] if reveal else "***",
                "address": pii["address"] if reveal else "***",
            },
            "booking": {
                "booking_number": booking.booking_number if booking else None,
                "project": booking.project.name if booking and booking.project else None,
                "plot": booking.plot.plot_number if booking and booking.plot else None,
                "area_sqft": _plain(booking.plot.area_sqft) if booking and booking.plot else None,
                "payment_plan": booking.payment_plan if booking else None,
            },
            "payments": [
                {
                    "received_on": str(payment.received_on),
                    "amount": str(payment.amount),
                    "mode": payment.mode,
                    "reference": payment.reference,
                    "receipt": payment.receipt.receipt_number if payment.receipt else None,
                }
                for payment in self.payments_against(invoice)
            ],
            "company": company_profile(self.db, self.actor.tenant_id),
            "amount_in_words": amount_in_words(invoice.total_amount),
        }

    # --------------------------------------------------------------- helpers
    def _replace_items(self, invoice: Invoice, items: list[InvoiceItemIn]) -> None:
        invoice.items = [
            InvoiceItem(
                description=item.description,
                hsn_sac=item.hsn_sac,
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                discount_amount=item.discount_amount,
                line_total=(item.quantity * item.unit_price - item.discount_amount).quantize(PAISE),
            )
            for item in items
        ]

    def _record_history(self, invoice: Invoice, from_status: str | None, to_status: str,
                        reason: str | None = None) -> None:
        entry = InvoiceStatusHistory(
            invoice_id=invoice.id,
            from_status=from_status,
            to_status=to_status,
            changed_by_id=self.actor.user_id,
            changed_by_label=self.actor.name,
            reason=reason,
            ip_address=self.actor.ip_address,
        )
        # Append through the relationship so an already-loaded collection (and
        # therefore the response we are about to serialise) stays coherent.
        invoice.history.append(entry)
        self.db.flush()
