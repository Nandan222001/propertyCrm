"""Money-side schemas: agents, commissions, payments and receipts."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.core.constants import PaymentStatus
from app.core.validators import normalise_enum, normalise_mobile, to_date, validate_email
from app.schemas.common import Money, ORMModel, SafeText, TimestampedResponse

PAYMENT_MODES = ("CASH", "UPI", "NEFT", "RTGS", "CHEQUE", "CARD", "TOKEN_ADVANCE")


class AgentCreate(SafeText):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=2, max_length=16, pattern=r"^[A-Za-z0-9\-]+$")
    email: str | None = Field(default=None, max_length=190)
    phone: str | None = Field(default=None, max_length=20)
    commission_rate: Decimal = Field(default=Decimal("0.0200"), ge=0, le=Decimal("0.25"))

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return validate_email(value) if value else None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_mobile(value) if value else None


class AgentUpdate(SafeText):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    code: str | None = Field(default=None, min_length=2, max_length=16, pattern=r"^[A-Za-z0-9\-]+$")
    email: str | None = Field(default=None, max_length=190)
    phone: str | None = Field(default=None, max_length=20)
    commission_rate: Decimal | None = Field(default=None, ge=0, le=Decimal("0.25"))
    is_active: str | None = Field(default=None, pattern=r"^(ACTIVE|INACTIVE)$")

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return validate_email(value) if value else None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_mobile(value) if value else None


class AgentPerformance(ORMModel):
    agent_id: int
    code: str
    name: str
    deals: int = 0
    sales_value: Decimal = Decimal("0")
    collected: Decimal = Decimal("0")
    outstanding: Decimal = Decimal("0")
    commission_net: Decimal = Decimal("0")
    conversion_rate: float = 0.0


class AgentResponse(TimestampedResponse):
    public_id: str
    code: str
    name: str
    email: str | None = None
    phone: str | None = None
    commission_rate: Decimal
    is_active: str = "ACTIVE"


class CommissionCreate(SafeText):
    agent_id: int = Field(gt=0)
    booking_id: int | None = Field(default=None, gt=0)
    deal_value: Money
    rate: Decimal = Field(gt=0, le=Decimal("0.25"))
    notes: str | None = Field(default=None, max_length=2000)


class CommissionDecision(SafeText):
    status: str = Field(pattern=r"^(APPROVED|REJECTED|PAYABLE|PROCESSING|PAID|ON_HOLD)$")
    payout_reference: str | None = Field(default=None, max_length=80)
    reason: str | None = Field(default=None, max_length=255)


class CommissionResponse(TimestampedResponse):
    public_id: str
    agent_id: int
    agent_name: str | None = None
    booking_id: int | None = None
    payment_id: int | None = None
    received_on: date | None = None
    deal_value: Decimal
    rate: Decimal
    gross_amount: Decimal
    tds_amount: Decimal
    net_amount: Decimal
    status: str
    payout_reference: str | None = None
    paid_at: datetime | None = None


class PaymentCancel(SafeText):
    reason: str = Field(min_length=3, max_length=255)


class PaymentCreate(SafeText):
    booking_id: int = Field(gt=0)
    amount: Money
    mode: str = Field(default="UPI", max_length=24)
    reference: str | None = Field(default=None, max_length=80)
    paid_to: str | None = Field(default=None, max_length=80, description="Who the money was paid to")
    received_on: date | None = None
    due_date: date | None = None
    final_price: Money | None = Field(default=None, description="Reconfirm the price at collection time")
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("mode")
    @classmethod
    def _mode(cls, value: str) -> str:
        return normalise_enum(value, PAYMENT_MODES, field="mode")

    @field_validator("received_on", "due_date", mode="before")
    @classmethod
    def _dates(cls, value, info):
        return to_date(value, field=info.field_name.replace("_", " ")) if value else None

    @model_validator(mode="after")
    def _amount_rules(self) -> PaymentCreate:
        if self.amount <= 0:
            raise ValueError("payment amount must be greater than zero")
        if self.amount > Decimal("1000000000"):
            raise ValueError("payment amount exceeds the per-transaction ceiling")
        return self


class PaymentResponse(TimestampedResponse):
    public_id: str
    booking_id: int
    booking_number: str | None = None
    customer_id: int
    customer_name: str | None = None
    amount: Decimal
    mode: str
    reference: str | None = None
    received_on: date
    due_date: date | None = None
    status: str
    balance_after: Decimal
    receipt: ReceiptResponse | None = None


class PaymentLedgerRow(ORMModel):
    booking_number: str
    customer_name: str | None = None
    project_name: str | None = None
    plot_number: str | None = None
    final_price: Decimal
    paid_amount: Decimal
    balance: Decimal
    due_date: date | None = None
    status: str
    agent_name: str | None = None


class LedgerSummary(ORMModel):
    contract_value: Decimal
    collected: Decimal
    outstanding: Decimal
    overdue: Decimal
    status_counts: dict[str, int]
    aging: dict[str, Decimal]


class ReceiptResponse(TimestampedResponse):
    public_id: str
    receipt_number: str
    payment_id: int
    booking_id: int
    customer_id: int
    issued_on: date
    amount: Decimal
    final_price: Decimal
    balance: Decimal
    mode: str
    reference: str | None = None
    paid_to: str | None = None
    payment_status: str | None = None
    is_shared_with_customer: bool = False


class ReceiptCopy(ORMModel):
    """Printable payload: office copy + customer copy in one page (A4)."""

    receipt: ReceiptResponse
    customer: dict
    booking: dict
    company: dict
    amount_in_words: str


class OverdueRow(ORMModel):
    booking_number: str
    customer_name: str | None = None
    amount: Decimal
    due_date: date | None = None
    days_overdue: int
    status: str = PaymentStatus.OVERDUE.value
