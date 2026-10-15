"""Company expenses and the profit-till-date figure (collections − commission − expenses)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import Permission
from app.core.context import ActorContext, PaginationContext
from app.core.responses import Paginated
from app.models.expense import Expense
from app.repositories.booking_repository import BookingRepository
from app.repositories.expense_repository import ExpenseRepository
from app.schemas.expense import ExpenseCreate, ExpenseResponse, ExpenseUpdate
from app.services.base_service import BaseService


class ExpenseService(BaseService[Expense]):
    resource = "expense"
    repository_class = ExpenseRepository
    permissions = {
        "view": Permission.EXPENSE_VIEW,
        "create": Permission.EXPENSE_MANAGE,
        "update": Permission.EXPENSE_MANAGE,
        "delete": Permission.EXPENSE_MANAGE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.expenses: ExpenseRepository = self.repository  # type: ignore[assignment]
        self.bookings = BookingRepository(db)

    def serialise(self, expense: Expense) -> ExpenseResponse:
        return ExpenseResponse.model_validate(expense)

    def paginate(self, page: PaginationContext) -> Paginated[Expense]:
        return self.list(page)

    def add(self, payload: ExpenseCreate) -> Expense:
        values = payload.model_dump()
        values["expense_date"] = values["expense_date"] or date.today()
        values["recorded_by_id"] = self.actor.user_id
        return self.create(values)

    def edit(self, expense_id: int, payload: ExpenseUpdate) -> Expense:
        values = payload.model_dump()
        if values["expense_date"] is None:
            values.pop("expense_date")
        return self.update(expense_id, values)

    def profit_summary(self) -> dict[str, str]:
        self._authorise("view")
        collected = self.bookings.totals(None)["collected"]
        commissions = self.expenses.commissions_total()
        expenses = self.expenses.total()
        profit = Decimal(collected) - commissions - expenses
        return {
            "collected": str(collected),
            "commissions": str(commissions),
            "expenses": str(expenses),
            "profit": str(profit),
        }
