"""Expense routes (accounts and admin)."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.controllers import expense_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.expense import ExpenseCreate, ExpenseUpdate

router = APIRouter(tags=["Expenses"])

VIEW = Annotated[None, Depends(require(Permission.EXPENSE_VIEW))]
MANAGE = Annotated[None, Depends(require(Permission.EXPENSE_MANAGE))]


@router.get("/expenses", summary="List company expenses")
def list_expenses(page: PaginationDep, service: controller.ExpenseServiceDep, _: VIEW = None):
    return controller.list_expenses(page, service)


@router.get("/expenses/profit-summary", summary="Collected − commission − expenses = company profit till date")
def profit_summary(service: controller.ExpenseServiceDep, _: VIEW = None,
                   date_from: date | None = Query(default=None, description="Start of the period (inclusive)"),
                   date_to: date | None = Query(default=None, description="End of the period (inclusive)")):
    return controller.profit_summary(service, date_from, date_to)


@router.get("/expenses/agent-payout/{agent_id}", summary="What an agent has earned, been paid and is still owed")
def agent_payout_position(agent_id: int, service: controller.ExpenseServiceDep, _: VIEW = None,
                          exclude_expense_id: int | None = Query(default=None, gt=0)):
    return controller.agent_payout_position(agent_id, service, exclude_expense_id)


@router.post("/expenses", status_code=status.HTTP_201_CREATED, summary="Record an expense")
def create_expense(payload: ExpenseCreate, service: controller.ExpenseServiceDep, _: MANAGE = None):
    return controller.create_expense(payload, service)


@router.put("/expenses/{expense_id}", summary="Edit an expense")
def update_expense(expense_id: int, payload: ExpenseUpdate, service: controller.ExpenseServiceDep, _: MANAGE = None):
    return controller.update_expense(expense_id, payload, service)


@router.delete("/expenses/{expense_id}", summary="Delete an expense")
def delete_expense(expense_id: int, service: controller.ExpenseServiceDep, _: MANAGE = None):
    return controller.delete_expense(expense_id, service)
