"""Expense queries, including the company-profit roll-up."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select

from app.models.expense import Expense
from app.models.payment import Commission
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

    def total(self) -> Decimal:
        value = self.db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.is_deleted.is_(False))
        ).scalar_one()
        return Decimal(str(value or 0))

    def commissions_total(self) -> Decimal:
        """Gross commission accrued on deals, rejected ones excluded."""
        value = self.db.execute(
            select(func.coalesce(func.sum(Commission.gross_amount), 0))
            .where(Commission.is_deleted.is_(False), Commission.status != "REJECTED")
        ).scalar_one()
        return Decimal(str(value or 0))
