"""Expense endpoints."""

from __future__ import annotations

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


def profit_summary(service: ExpenseServiceDep) -> dict:
    return success(service.profit_summary(), "Company profit till date")
