"""Payment scheme and quote schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import Money, ORMModel, RequestModel, SafeText

Kind = Literal["OUTRIGHT", "EMI", "EMI_SPECIAL"]


class PlanBase(SafeText):
    name: str = Field(min_length=2, max_length=80)
    kind: Kind
    application_fee: Money = Decimal("0")
    enrollment_fee: Money = Decimal("0")
    allotment_amount: Money = Decimal("0")
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=50)
    outright_days: int | None = Field(default=None, ge=1, le=365)
    emi_count: int | None = Field(default=None, ge=1, le=360)
    special_count: int | None = Field(default=None, ge=1, le=360)
    special_percent: Decimal | None = Field(default=None, gt=0, lt=100)
    special_months: list[int] = Field(default_factory=list, max_length=360)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=1000)


class PlanCreate(PlanBase):
    pass


class PlanUpdate(PlanBase):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    kind: Kind | None = None


class PlanResponse(ORMModel):
    id: int
    public_id: str
    project_id: int
    name: str
    kind: str
    application_fee: Decimal
    enrollment_fee: Decimal
    allotment_amount: Decimal
    discount_percent: Decimal
    outright_days: int | None = None
    emi_count: int | None = None
    special_count: int | None = None
    special_percent: Decimal | None = None
    special_months: list[int] = Field(default_factory=list)
    is_active: bool
    sort_order: int


class QuoteRequest(RequestModel):
    """Either a saved scheme (``plan_id``) or one being edited (``plan``); either a real plot or a sample price."""

    plan_id: int | None = Field(default=None, gt=0)
    plan: PlanCreate | None = None
    plot_id: int | None = Field(default=None, gt=0)
    price: Money | None = None
    booking_date: date | None = None
    allotment_amount: Money = Decimal("0")     # what is paid at booking; the discount applies to the rest


class InstallmentResponse(ORMModel):
    id: int
    sequence: int
    label: str
    kind: str
    due_date: date
    amount: Decimal
    paid_amount: Decimal
    balance: Decimal
    status: str          # PAID | PARTIAL | OVERDUE | PENDING
