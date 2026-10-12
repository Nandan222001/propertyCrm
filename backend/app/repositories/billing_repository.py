"""Invoice repositories: numbering, scoping, KPI aggregation, overdue sweep."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select, update

from app.core.constants import INVOICE_SEQUENCE_START, InvoiceStatus
from app.models.billing import Invoice
from app.repositories.base_repository import BaseRepository


class InvoiceRepository(BaseRepository[Invoice]):
    model = Invoice
    searchable = ("invoice_number", "notes")
    sortable = {
        "id": Invoice.id,
        "invoice_number": Invoice.invoice_number,
        "issue_date": Invoice.issue_date,
        "due_date": Invoice.due_date,
        "total_amount": Invoice.total_amount,
        "amount_paid": Invoice.amount_paid,
        "balance_amount": Invoice.balance_amount,
        "status": Invoice.status,
    }
    default_sort = "issue_date"

    #: Statuses excluded from the "live book" (never collectible, never overdue).
    NON_BILLABLE = (InvoiceStatus.DRAFT.value, InvoiceStatus.CANCELLED.value)

    def scope_clause_for(self, *, customer_id: int | None, agent_id: int | None):
        from app.models.booking import Booking

        if customer_id is not None:
            return Invoice.customer_id == customer_id
        if agent_id is not None:
            booking_ids = select(Booking.id).where(Booking.agent_id == agent_id)
            return Invoice.booking_id.in_(booking_ids)
        return None

    def next_number(self, *, year: int) -> str:
        """``INV-YYYY-NNNN`` — monotonic per calendar year."""
        like = f"INV-{year}-%"
        current = self.db.execute(
            select(func.max(Invoice.invoice_number)).where(Invoice.invoice_number.like(like))
        ).scalar_one()
        sequence = int(str(current).rsplit("-", 1)[-1]) if current else INVOICE_SEQUENCE_START
        return f"INV-{year}-{sequence + 1:04d}"

    def summary(self, scope_clause=None) -> dict:
        """One aggregate query for the billing KPI block (no per-status round trips)."""
        stmt = select(
            Invoice.status,
            func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.total_amount), 0),
            func.coalesce(func.sum(Invoice.amount_paid), 0),
            func.coalesce(func.sum(Invoice.balance_amount), 0),
            func.coalesce(func.sum(Invoice.gst_amount), 0),
        )
        stmt = stmt.where(Invoice.is_deleted == 0)
        if scope_clause is not None:
            stmt = stmt.where(scope_clause)
        stmt = stmt.group_by(Invoice.status)

        totals = {
            "billed": Decimal("0"),
            "collected": Decimal("0"),
            "outstanding": Decimal("0"),
            "overdue": Decimal("0"),
            "gst_charged": Decimal("0"),
            "draft_value": Decimal("0"),
            "invoice_count": 0,
            "status_counts": {},
            "overdue_count": 0,
        }
        for status, count, total, paid, balance, gst in self.db.execute(stmt).all():
            count = int(count or 0)
            total, paid = Decimal(str(total or 0)), Decimal(str(paid or 0))
            balance, gst = Decimal(str(balance or 0)), Decimal(str(gst or 0))
            totals["status_counts"][status] = count
            totals["invoice_count"] += count
            if status == InvoiceStatus.DRAFT.value:
                totals["draft_value"] += total
                continue
            if status == InvoiceStatus.CANCELLED.value:
                continue
            totals["billed"] += total
            totals["collected"] += paid
            totals["outstanding"] += balance
            totals["gst_charged"] += gst
            if status == InvoiceStatus.OVERDUE.value:
                totals["overdue"] += balance
                totals["overdue_count"] += count
        return totals

    def mark_overdue(self, as_of: date | None = None) -> int:
        """Scheduled sweep: issued/partial invoices past their due date → OVERDUE."""
        today = as_of or date.today()
        result = self.db.execute(
            update(Invoice)
            .where(
                Invoice.due_date.is_not(None),
                Invoice.due_date < today,
                Invoice.status.in_((InvoiceStatus.ISSUED.value, InvoiceStatus.PARTIALLY_PAID.value)),
                Invoice.is_deleted == 0,
            )
            .values(status=InvoiceStatus.OVERDUE.value)
        )
        return int(result.rowcount or 0)
