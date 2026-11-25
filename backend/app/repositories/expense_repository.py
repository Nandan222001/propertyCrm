"""Expense queries, including the company-profit roll-up."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.models.customer import Customer
from app.models.expense import Expense
from app.core.constants import PaymentStatus
from app.models.payment import Commission, Payment
from app.repositories.base_repository import BaseRepository

class ExpenseRepository(BaseRepository[Expense]):
    model = Expense
    searchable = ("category", "description", "paid_to", "reference")
    sortable = {
        "id": Expense.id,
        "expense_date": Expense.expense_date,
        "amount": Expense.amount,
        "category": Expense.category,
        "created_at": Expense.created_at,
    }
    default_sort = "expense_date"

    def total(self, date_from: date | None = None, date_to: date | None = None, *,
              category: str | None = None, exclude_category: str | None = None) -> Decimal:
        stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.is_deleted.is_(False))
        if category:
            stmt = stmt.where(Expense.category == category)
        if exclude_category:
            stmt = stmt.where(Expense.category != exclude_category)
        if date_from:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to:
            stmt = stmt.where(Expense.expense_date <= date_to)
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))

    def agent_paid_out(self, agent_id: int, *, exclude_expense_id: int | None = None) -> Decimal:
        """What has already been paid to the agent as "Agent payout" expenses."""
        from app.core.constants import AGENT_PAYOUT_CATEGORY

        stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.is_deleted.is_(False), Expense.category == AGENT_PAYOUT_CATEGORY, Expense.agent_id == agent_id)
        if exclude_expense_id:
            stmt = stmt.where(Expense.id != exclude_expense_id)
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))

    def agent_commission(self, agent_id: int) -> tuple[Decimal, Decimal, Decimal]:
        """(gross, TDS, net) of everything the agent has earned, cancelled and rejected commissions left out."""
        row = self.db.execute(select(
            func.coalesce(func.sum(Commission.gross_amount), 0), func.coalesce(func.sum(Commission.tds_amount), 0),
            func.coalesce(func.sum(Commission.net_amount), 0),
        ).where(Commission.is_deleted.is_(False), Commission.agent_id == agent_id,
                Commission.status.notin_(("CANCELLED", "REJECTED")))).one()
        return tuple(Decimal(str(v or 0)) for v in row)  # type: ignore[return-value]

    def commissions_total(self, date_from: date | None = None, date_to: date | None = None) -> Decimal:
        """Gross commission accrued on deals, rejected ones excluded (optionally only what accrued in the period)."""
        stmt = select(func.coalesce(func.sum(Commission.gross_amount), 0)).where(
            Commission.is_deleted.is_(False), Commission.status != "REJECTED")
        if date_from:
            stmt = stmt.where(func.date(Commission.created_at) >= date_from)
        if date_to:
            stmt = stmt.where(func.date(Commission.created_at) <= date_to)
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))

    def enrollment_between(self, date_from: date | None = None, date_to: date | None = None) -> Decimal:
        """Money received with applications that counts as collection: the enrollment fee only — the application
        fee is never counted."""
        from app.models.application import Application

        stmt = select(func.coalesce(func.sum(Application.enrollment_fee), 0)).where(
            Application.is_deleted.is_(False), Application.status != "CANCELLED",
            Application.customer_id.in_(select(Customer.id).where(Customer.is_deleted.is_(False))))
        if date_from:
            stmt = stmt.where(Application.received_on >= date_from)
        if date_to:
            stmt = stmt.where(Application.received_on <= date_to)
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))

    def collected_between(self, date_from: date | None, date_to: date | None) -> Decimal:
        """Customer money received (cancelled payments excluded) with a received date inside the period."""
        stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.is_deleted.is_(False), Payment.status != PaymentStatus.CANCELLED.value)
        if date_from:
            stmt = stmt.where(Payment.received_on >= date_from)
        if date_to:
            stmt = stmt.where(Payment.received_on <= date_to)
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))
