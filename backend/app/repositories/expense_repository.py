"""Expense queries, including the company-profit roll-up."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select

from app.models.expense import Expense
from app.core.constants import PaymentStatus
from app.models.payment import Commission, Payment
from app.repositories.base_repository import BaseRepository

#: The flat application fee; it is not counted as company collection.
APPLICATION_FEE = Decimal("500")


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

    def total(self, date_from: date | None = None, date_to: date | None = None) -> Decimal:
        stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.is_deleted.is_(False))
        if date_from:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to:
            stmt = stmt.where(Expense.expense_date <= date_to)
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))

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
        """Money received with applications that counts as collection: the enrollment fee, plus anything entered
        above the flat ₹500 application fee (the ₹500 itself is not company collection)."""
        from app.models.application import Application

        over = case((Application.application_fee > APPLICATION_FEE, Application.application_fee - APPLICATION_FEE), else_=0)
        stmt = select(func.coalesce(func.sum(Application.enrollment_fee + over), 0)).where(Application.is_deleted.is_(False))
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
