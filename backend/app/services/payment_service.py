"""Collections: payments, receipts, ledger, ageing and cron-style maintenance.

Money-handling rules:
* amounts are ``Decimal`` end-to-end (never floats) and validated > 0;
* a payment may not exceed the outstanding balance (over-collection is blocked);
* recording a payment recomputes the booking's paid amount inside one
  transaction and issues a numbered receipt (``RCT-YYYY-NNNN``) atomically;
* receipts and bills can be printed (office + customer copy) or shared with the
  customer; sharing is audited.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import AuditAction, PaymentStatus, Permission
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, PermissionDeniedError
from app.core.responses import Paginated
from app.models.payment import Payment, Receipt
from app.repositories.booking_repository import BookingRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.finance_repository import PaymentRepository, ReceiptRepository
from app.repositories.property_repository import PlotRepository
from app.schemas.finance import (
    LedgerSummary,
    OverdueRow,
    PaymentCreate,
    PaymentLedgerRow,
    PaymentResponse,
    ReceiptCopy,
    ReceiptResponse,
)
from app.services.base_service import BaseService
from app.services.company_profile import company_profile
from app.services.org_settings import setting_int
from app.services.plan_service import PlanService
from app.utils.money import amount_in_words

PAYMENT_STATUS_FOR = {
    True: PaymentStatus.PAID.value,
    False: PaymentStatus.PARTIALLY_PAID.value,
}



class PaymentService(BaseService[Payment]):
    resource = "payment"
    repository_class = PaymentRepository
    permissions = {
        "view": (Permission.PAYMENT_VIEW_ALL, Permission.PAYMENT_VIEW_OWN),
        "create": Permission.PAYMENT_CREATE,
        "update": Permission.PAYMENT_CREATE,
        "delete": Permission.PAYMENT_APPROVE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.payments: PaymentRepository = self.repository  # type: ignore[assignment]
        self.receipts = ReceiptRepository(db)
        self.bookings = BookingRepository(db)
        self.customers = CustomerRepository(db)
        self.plots = PlotRepository(db)

    # -------------------------------------------------------------- scoping
    def scope_clause(self):
        if self.actor.can(Permission.PAYMENT_VIEW_ALL):
            return None
        if self.actor.is_customer_portal:
            return self.payments.scope_clause_for(customer_id=self.actor.customer_id, agent_id=None)
        return self.payments.scope_clause_for(customer_id=None, agent_id=self.actor.agent_id)

    # ----------------------------------------------------------------- read
    def paginate(self, page: PaginationContext) -> Paginated[Payment]:
        if not self.actor.can(Permission.PAYMENT_VIEW_ALL) and not self.actor.is_customer_portal:
            # Agents are read-only on the money ledger.
            self._authorise("view")
        return self.payments.paginate(
            page=page.page, page_size=page.page_size, search=page.search, sort=page.sort,
            filters=page.filters, scope_clause=self.scope_clause(),
        )

    def serialise(self, payment: Payment) -> PaymentResponse:
        return PaymentResponse(
            id=payment.id,
            public_id=payment.public_id,
            booking_id=payment.booking_id,
            booking_number=payment.booking.booking_number if payment.booking else None,
            customer_id=payment.customer_id,
            customer_name=payment.booking.customer.name if payment.booking and payment.booking.customer else None,
            amount=payment.amount,
            mode=payment.mode,
            reference=payment.reference,
            received_on=payment.received_on,
            due_date=payment.due_date,
            status=payment.status,
            balance_after=payment.balance_after,
            receipt=ReceiptResponse.model_validate(payment.receipt, from_attributes=True) if payment.receipt else None,
            created_at=payment.created_at,
            updated_at=payment.updated_at,
        )

    def ledger(self, page: PaginationContext) -> Paginated[PaymentLedgerRow]:
        """Ledger view: one row per booking with live balance (portal-safe)."""
        self._authorise("view")
        # Row scope is applied in the query itself (never after paging): everyone with the all-payments
        # permission sees every booking, a portal customer only their own, an agent only their own deals.
        if self.actor.can(Permission.PAYMENT_VIEW_ALL):
            booking_scope = None
        elif self.actor.is_customer_portal:
            booking_scope = self.bookings.scope_clause_for(agent_id=None, customer_id=self.actor.customer_id)
        else:
            booking_scope = self.bookings.scope_clause_for(agent_id=self.actor.agent_id, customer_id=None)
        bookings = self.bookings.paginate(
            page=page.page, page_size=page.page_size, search=page.search, sort=page.sort,
            filters=page.filters, scope_clause=booking_scope,
        )
        rows: list[PaymentLedgerRow] = []
        for booking in bookings.items:
            due = None
            if booking.plan_id is not None:
                due = PlanService(self.db, self.actor).next_due(booking.id)     # follows the payment scheme's schedule
            else:
                latest = self.payments.list(filters={"booking_id": booking.id}, sort="received_on:desc", limit=1)
                if latest:
                    due = latest[0].due_date
            rows.append(
                PaymentLedgerRow(
                    booking_number=booking.booking_number,
                    customer_name=booking.customer.name if booking.customer else None,
                    project_name=booking.project.name if booking.project else None,
                    plot_number=booking.plot.plot_number if booking.plot else None,
                    final_price=booking.final_price,
                    paid_amount=booking.paid_amount,
                    balance=booking.balance,
                    due_date=due,
                    status=self._ledger_status(booking, due),
                    agent_name=booking.agent.name if booking.agent else None,
                )
            )
        return Paginated[PaymentLedgerRow](items=rows, meta=bookings.meta)

    def summary(self) -> LedgerSummary:
        scope = self.scope_clause()
        totals = self.bookings.totals(scope)
        overdue_rows = self.overdue()
        return LedgerSummary(
            contract_value=totals["contract_value"],
            collected=totals["collected"],
            outstanding=totals["outstanding"],
            overdue=sum((row.amount for row in overdue_rows), Decimal("0")),
            status_counts=self.bookings.status_counts(scope),
            aging=self.payments.aging_buckets(),
        )

    def overdue(self) -> list[OverdueRow]:
        today = date.today()
        rows: list[OverdueRow] = []
        for payment in self.bookings.overdue_payments(today):
            booking = payment.booking
            rows.append(
                OverdueRow(
                    booking_number=booking.booking_number if booking else "-",
                    customer_name=booking.customer.name if booking and booking.customer else None,
                    amount=payment.amount,
                    due_date=payment.due_date,
                    days_overdue=(today - payment.due_date).days if payment.due_date else 0,
                )
            )
        return rows

    # --------------------------------------------------------------- create
    def record_payment(self, payload: PaymentCreate) -> Payment:
        self._authorise("create")
        booking = self.bookings.get_or_404(payload.booking_id)

        # Price confirmation: accounts reconfirm the final price at collection time.
        if payload.final_price is not None and payload.final_price != booking.final_price:
            if not self.actor.can(Permission.PAYMENT_APPROVE):
                raise PermissionDeniedError("Only an approver can revise the booking price")
            booking.final_price = payload.final_price
            PlanService(self.db, self.actor).rescale(booking, payload.final_price)

        outstanding = booking.balance
        if outstanding <= 0:
            raise BusinessRuleError("This booking is already fully paid")
        if payload.amount > outstanding:
            raise BusinessRuleError(
                f"Amount exceeds the outstanding balance of ₹{outstanding:,.2f}"
            )

        new_paid = booking.paid_amount + payload.amount
        balance_after = booking.final_price - new_paid
        fully_paid = balance_after <= 0
        received_on = payload.received_on or date.today()

        # A booking made on a payment scheme: apply the money to the earliest unpaid lines, and the next
        # due date is the next unpaid line of that schedule.
        schedule_due = None
        if booking.plan_id is not None:
            plans = PlanService(self.db, self.actor)
            plans.allocate_payment(booking.id, payload.amount)
            schedule_due = plans.next_due(booking.id)

        payment = Payment(
            booking_id=booking.id,
            customer_id=booking.customer_id,
            amount=payload.amount,
            mode=payload.mode,
            reference=payload.reference,
            received_on=received_on,
            due_date=payload.due_date or schedule_due or (None if fully_paid else received_on + timedelta(days=setting_int(self.db, "tax", "installmentDays"))),
            status=PAYMENT_STATUS_FOR[fully_paid],
            balance_after=max(balance_after, Decimal("0")),
            notes=payload.notes,
            recorded_by_id=self.actor.user_id,
            approved_by_id=self.actor.user_id if self.actor.can(Permission.PAYMENT_APPROVE) else None,
        )
        self.payments.create(payment)

        # Recompute the booking's paid amount from the ledger — the ledger wins.
        booking.paid_amount = new_paid
        self.db.flush()
        if fully_paid and booking.plot is not None:
            booking.plot.status = "SOLD"
            self.db.flush()

        receipt = Receipt(
            receipt_number=self.receipts.next_number(year=received_on.year),
            payment_id=payment.id,
            customer_id=booking.customer_id,
            booking_id=booking.id,
            issued_on=received_on,
            amount=payload.amount,
            final_price=booking.final_price,
            balance=max(balance_after, Decimal("0")),
            mode=payload.mode,
            reference=payload.reference,
        )
        self.receipts.create(receipt)

        self._audit(AuditAction.CREATE, payment, after={
            "amount": str(payment.amount), "booking": booking.booking_number,
            "receipt": receipt.receipt_number, "balance": str(receipt.balance),
        }, summary=f"₹{payload.amount} collected via {payload.mode}")

        self._maybe_create_commission(booking)
        return payment

    def set_next_due(self, booking_number: str, due: date) -> dict:
        """Move the next instalment's due date. The ledger status (pending / overdue) follows from it."""
        self._authorise("create")
        from app.repositories.booking_repository import BookingRepository

        booking = BookingRepository(self.db).get_by(booking_number=booking_number)
        if booking is None:
            raise BusinessRuleError("Unknown booking")
        if booking.balance <= 0:
            raise BusinessRuleError("This booking is fully paid — there is no next instalment")
        if booking.plan_id is not None:
            raise BusinessRuleError("This booking follows its payment scheme's schedule, so its due dates are fixed by the scheme")
        latest = self.payments.list(filters={"booking_id": booking.id}, sort="received_on:desc", limit=1)
        if not latest:
            raise BusinessRuleError("Record a payment first — the due date belongs to the instalment schedule")
        previous = latest[0].due_date
        latest[0].due_date = due
        self.db.flush()
        self._audit(AuditAction.UPDATE, latest[0], before={"due_date": str(previous)}, after={"due_date": str(due)},
                    summary=f"Next due date for {booking.booking_number} set to {due}")
        return {"booking_number": booking.booking_number, "due_date": str(due),
                "status": self._ledger_status(booking, due)}

    def mark_overdue(self) -> dict:
        """Scheduled job — normally invoked by cron, not by an HTTP caller."""
        if not self.actor.is_authenticated or not self.actor.can(Permission.PAYMENT_APPROVE):
            raise PermissionDeniedError("Only the payments approver or the scheduler may run this")
        updated = self.payments.mark_overdue()
        self._audit(AuditAction.UPDATE, None, summary=f"Marked {updated} payments overdue",
                    resource_id="bulk")
        return {"overdue_marked": updated}

    # -------------------------------------------------------------- receipts
    def get_receipt(self, receipt_id: int) -> Receipt:
        receipt = self.receipts.get_or_404(receipt_id)
        if self.actor.is_customer_portal and receipt.customer_id != self.actor.customer_id:
            raise PermissionDeniedError("This receipt belongs to another customer")
        return receipt

    def receipt_copy(self, receipt_id: int) -> ReceiptCopy:
        """Printable payload with the amount in words (Indian numbering)."""
        from app.repositories.booking_repository import BookingRepository

        receipt = self.get_receipt(receipt_id)
        booking = BookingRepository(self.db).get_or_404(receipt.booking_id)
        customer = self.customers.get_or_404(receipt.customer_id)
        pii = self.customers.decrypt_pii(customer)
        reveal = self.actor.can(Permission.PII_REVEAL) or self.actor.customer_id == customer.id
        return ReceiptCopy(
            receipt=ReceiptResponse.model_validate(receipt, from_attributes=True),
            customer={
                "name": customer.name,
                "email": pii["email"] if reveal else "***",
                "phone": pii["phone"] if reveal else "***",
                "address": pii["address"] if reveal else "***",
            },
            booking={
                "booking_number": booking.booking_number,
                "project": booking.project.name if booking.project else None,
                "plot": booking.plot.plot_number if booking.plot else None,
                "final_price": str(booking.final_price),
                "paid_amount": str(booking.paid_amount),
            },
            company=company_profile(self.db, self.actor.tenant_id),
            amount_in_words=amount_in_words(receipt.amount),
        )

    def share_receipt(self, receipt_id: int) -> Receipt:
        """Share with the customer portal/WhatsApp; the action is audited."""
        if not self.actor.can(Permission.RECEIPT_MANAGE):
            raise PermissionDeniedError("Your role cannot share bills")
        receipt = self.receipts.get_or_404(receipt_id)
        self.receipts.mark_shared(receipt)
        self._audit(AuditAction.UPDATE, receipt, summary=f"Receipt {receipt.receipt_number} shared")
        return receipt

    def receipts_for(self, *, booking_id: int | None = None, customer_id: int | None = None) -> list[Receipt]:
        filters: dict = {}
        if booking_id:
            filters["booking_id"] = booking_id
        if customer_id:
            filters["customer_id"] = customer_id
        if self.actor.is_customer_portal:
            filters["customer_id"] = self.actor.customer_id
        return self.receipts.list(filters=filters, sort="issued_on:desc")

    # --------------------------------------------------------------- helpers
    def _ledger_status(self, booking, due: date | None) -> str:
        if booking.balance <= 0:
            return PaymentStatus.PAID.value
        if due and due < date.today():
            return PaymentStatus.OVERDUE.value
        if booking.paid_amount > 0:
            return PaymentStatus.PARTIALLY_PAID.value
        return PaymentStatus.PENDING.value

    def _maybe_create_commission(self, booking) -> None:
        """Create the agent commission when the booking is confirmed (idempotent)."""
        from app.services.commission_service import CommissionService

        if booking.agent_id is None or booking.status not in ("CONFIRMED", "AGREEMENT", "REGISTERED"):
            return
        service = CommissionService(self.db, self.actor)
        service.ensure_for_booking(booking)
