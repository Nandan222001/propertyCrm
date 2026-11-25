"""Expense endpoints."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.services.expense_service import ExpenseService


def get_expense_service(db: DbDep, actor: ActorDep) -> ExpenseService:
    return ExpenseService(db, actor)


ExpenseServiceDep = Annotated[ExpenseService, Depends(get_expense_service)]


def list_expenses(page: PaginationDep, service: ExpenseServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(e).model_dump(mode="json") for e in result.items], meta=result.meta.model_dump())


def create_expense(payload: ExpenseCreate, service: ExpenseServiceDep) -> dict:
    expense = service.add(payload)
    return success(service.serialise(expense).model_dump(mode="json"), "Expense recorded")


def update_expense(expense_id: int, payload: ExpenseUpdate, service: ExpenseServiceDep) -> dict:
    expense = service.edit(expense_id, payload)
    return success(service.serialise(expense).model_dump(mode="json"), "Expense updated")


def delete_expense(expense_id: int, service: ExpenseServiceDep) -> dict:
    service.delete(expense_id)
    return success(None, "Expense deleted")


def agent_payout_position(agent_id: int, service: ExpenseServiceDep, exclude_expense_id: int | None = None) -> dict:
    return success(service.agent_payout_position(agent_id, exclude_expense_id=exclude_expense_id), "What the agent is owed")


def profit_summary(service: ExpenseServiceDep, date_from: date | None = None, date_to: date | None = None) -> dict:
    return success(service.profit_summary(date_from, date_to), "Company profit till date" if not (date_from or date_to) else "Company profit for the period")
