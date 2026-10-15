"""Expense schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.core.validators import to_date
from app.schemas.common import Money, SafeText, TimestampedResponse


class ExpenseBase(SafeText):
    category: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=2, max_length=255)
    amount: Money
    expense_date: date | None = None
    paid_to: str | None = Field(default=None, max_length=120)
    payment_mode: str | None = Field(default=None, max_length=24)
    reference: str | None = Field(default=None, max_length=80)

    @field_validator("expense_date", mode="before")
    @classmethod
    def _date(cls, value):
        return to_date(value, field="expense date") if value else None

    @model_validator(mode="after")
    def _rules(self) -> ExpenseBase:
        if self.amount <= 0:
            raise ValueError("Enter an amount greater than zero.")
        if self.amount > Decimal("1000000000"):
            raise ValueError("That amount is too large.")
        if self.expense_date and self.expense_date > date.today():
            raise ValueError("The expense date cannot be in the future.")
        return self


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(ExpenseBase):
    pass


class ExpenseResponse(TimestampedResponse):
    public_id: str
    category: str
    description: str
    amount: Decimal
    expense_date: date
    paid_to: str | None = None
    payment_mode: str | None = None
    reference: str | None = None
