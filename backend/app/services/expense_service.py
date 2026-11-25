"""Company expenses and the profit-till-date figure (collections − commission − expenses)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import AGENT_PAYOUT_CATEGORY, Permission
from app.core.exceptions import BusinessRuleError
from app.core.context import ActorContext, PaginationContext
from app.core.responses import Paginated
from app.models.expense import Expense
from app.repositories.booking_repository import BookingRepository
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.finance_repository import AgentRepository
from app.schemas.expense import ExpenseCreate, ExpenseResponse, ExpenseUpdate
from app.services.base_service import BaseService
from app.services.notification_service import agent_user_id, emit


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
        response = ExpenseResponse.model_validate(expense)
        if expense.agent_id:
            agent = AgentRepository(self.db).get(expense.agent_id)
            response.agent_name = agent.name if agent else None
        return response

    # -------------------------------------------------------- agent payout
    def agent_payout_position(self, agent_id: int, *, exclude_expense_id: int | None = None) -> dict[str, str]:
        """What an agent has earned (commission, TDS, net), what has been paid to them so far and what is left."""
        self._authorise("view")
        agent = AgentRepository(self.db).get_or_404(agent_id)
        gross, tds, net = self.expenses.agent_commission(agent.id)
        paid = self.expenses.agent_paid_out(agent.id, exclude_expense_id=exclude_expense_id)
        return {
            "agent_id": str(agent.id), "agent_name": agent.name, "agent_code": agent.code,
            "gross": str(gross), "tds": str(tds), "net": str(net), "paid_out": str(paid),
            "balance": str(max(net - paid, Decimal("0"))),
        }

    def _prepare(self, values: dict, *, expense_id: int | None = None) -> dict:
        """An "Agent payout" names its agent and cannot exceed what is still owed to them; other categories have none."""
        if values.get("category") != AGENT_PAYOUT_CATEGORY:
            values["agent_id"] = None
            return values
        if not values.get("agent_id"):
            raise BusinessRuleError("Choose the agent this payout is for")
        position = self.agent_payout_position(values["agent_id"], exclude_expense_id=expense_id)
        if Decimal(values["amount"]) > Decimal(position["balance"]):
            raise BusinessRuleError(
                f"{position['agent_name']} is owed ₹{Decimal(position['balance']):,.2f} (net commission ₹{Decimal(position['net']):,.2f}"
                f" less ₹{Decimal(position['paid_out']):,.2f} already paid) — the payout cannot be more than that")
        values["paid_to"] = values.get("paid_to") or position["agent_name"]
        return values

    def paginate(self, page: PaginationContext) -> Paginated[Expense]:
        return self.list(page)

    def add(self, payload: ExpenseCreate) -> Expense:
        values = payload.model_dump()
        values["expense_date"] = values["expense_date"] or date.today()
        values["recorded_by_id"] = self.actor.user_id
        expense = self.create(self._prepare(values))
        if expense.category == AGENT_PAYOUT_CATEGORY:
            self._tell_agent(expense)
        return expense

    def _tell_agent(self, expense: Expense) -> None:
        """The agent sees, in their own notifications, that the company has paid them."""
        agent = AgentRepository(self.db).get(expense.agent_id) if expense.agent_id else None
        user_id = agent_user_id(self.db, agent)
        if user_id is None:
            return
        how = f" by {expense.payment_mode}" if expense.payment_mode else ""
        ref = f" (ref. {expense.reference})" if expense.reference else ""
        emit(self.db, title="Commission payout received",
             body=f"₹{Decimal(expense.amount):,.2f} of your commission was paid to you on "
                  f"{expense.expense_date.strftime('%d/%m/%Y')}{how}{ref}.",
             category="PAYOUT", severity="info", user_id=user_id)

    def edit(self, expense_id: int, payload: ExpenseUpdate) -> Expense:
        values = payload.model_dump()
        if values["expense_date"] is None:
            values.pop("expense_date")
        return self.update(expense_id, self._prepare(values, expense_id=expense_id))

    def profit_summary(self, date_from: date | None = None, date_to: date | None = None) -> dict[str, str]:
        """Till date by default; with a date range, only what was collected / accrued / spent inside it."""
        self._authorise("view")
        if date_from or date_to:
            collected = self.expenses.collected_between(date_from, date_to)
        else:
            collected = self.bookings.totals(None)["collected"]
        collected = Decimal(collected) + self.expenses.enrollment_between(date_from, date_to)
        commissions = self.expenses.commissions_total(date_from, date_to)
        # Paying an agent their commission is not a second cost: the commission is already deducted above.
        expenses = self.expenses.total(date_from, date_to, exclude_category=AGENT_PAYOUT_CATEGORY)
        agent_payouts = self.expenses.total(date_from, date_to, category=AGENT_PAYOUT_CATEGORY)
        profit = Decimal(collected) - commissions - expenses
        return {
            "collected": str(collected),
            "commissions": str(commissions),
            "expenses": str(expenses),
            "agent_payouts": str(agent_payouts),
            "profit": str(profit),
        }
