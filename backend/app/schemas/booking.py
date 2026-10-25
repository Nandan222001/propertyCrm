"""Booking workflow schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.core.constants import BookingStatus
from app.core.validators import normalise_enum, to_date, to_decimal
from app.schemas.common import Money, ORMModel, SafeText, TimestampedResponse


class BookingCreate(SafeText):
    customer_id: int = Field(gt=0)
    plot_id: int = Field(gt=0)
    final_price: Money
    token_amount: Money = Decimal("0")
    payment_mode: str | None = Field(default=None, max_length=24, description="How the amount paid at booking was received")
    payment_reference: str | None = Field(default=None, max_length=80, description="Transaction id / cheque no. of that payment")
    discount_amount: Money = Decimal("0")
    payment_plan: str | None = Field(default=None, max_length=80)
    plan_id: int | None = Field(default=None, gt=0, description="The project's payment scheme chosen for this booking")
    agent_code: str | None = Field(default=None, max_length=16)
    booking_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("booking_date", mode="before")
    @classmethod
    def _date(cls, value):
        return to_date(value, field="booking date") if value else None

    @field_validator("payment_mode", mode="before")
    @classmethod
    def _mode(cls, value):
        if value in (None, ""):
            return None
        from app.schemas.finance import PAYMENT_MODES

        return normalise_enum(value, tuple(m for m in PAYMENT_MODES if m != "TOKEN_ADVANCE"), field="payment mode")

    @model_validator(mode="after")
    def _money_rules(self) -> BookingCreate:
        if self.token_amount > self.final_price:
            raise ValueError("token amount cannot exceed the final price")
        if self.discount_amount > self.final_price:
            raise ValueError("discount cannot exceed the final price")
        return self


class BookingUpdate(SafeText):
    final_price: Money | None = None
    payment_plan: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)
    agent_code: str | None = Field(default=None, max_length=16)


class BookingDeleteRequest(SafeText):
    """Deleting a booking is re-authenticated: the admin types their own password first."""

    password: str = Field(min_length=1, max_length=128)
    #: When the booking already has payments / invoices, the admin may choose to delete those along with it.
    delete_payments: bool = False


class BookingDecision(SafeText):
    """Approve / reject with an auditable reason and optional revised price."""

    reason: str | None = Field(default=None, max_length=255)
    final_price: Money | None = None

    @field_validator("final_price", mode="before")
    @classmethod
    def _price(cls, value):
        return to_decimal(value, minimum=Decimal("0")) if value not in (None, "") else None


REGISTRY_STAGES = (
    "NOT_STARTED", "DOCUMENTS_PENDING", "AGREEMENT_SIGNED", "SUB_REGISTRAR_APPOINTMENT", "REGISTERED",
)


class RegistryStageUpdate(SafeText):
    stage: str
    reason: str | None = Field(default=None, max_length=255)

    @field_validator("stage")
    @classmethod
    def _stage(cls, value: str) -> str:
        return normalise_enum(value, list(REGISTRY_STAGES), field="stage")


class BookingStatusUpdate(SafeText):
    status: str
    reason: str | None = Field(default=None, max_length=255)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return normalise_enum(value, [s.value for s in BookingStatus], field="status")


class BookingResponse(TimestampedResponse):
    public_id: str
    booking_number: str
    customer_id: int
    customer_name: str | None = None
    project_id: int
    project_name: str | None = None
    plot_id: int
    plot_number: str | None = None
    agent_id: int | None = None
    agent_name: str | None = None
    booking_date: date
    final_price: Decimal
    token_amount: Decimal
    paid_amount: Decimal
    balance: Decimal
    status: str
    payment_plan: str | None = None
    plan_id: int | None = None
    approved_at: datetime | None = None
    rejection_reason: str | None = None
    registry_stage: str = "NOT_STARTED"


class BookingTimelineEntry(ORMModel):
    from_status: str | None = None
    to_status: str
    changed_by_label: str | None = None
    reason: str | None = None
    created_at: datetime


class BookingDetailResponse(BookingResponse):
    timeline: list[BookingTimelineEntry] = Field(default_factory=list)
    receipts: list[dict] = Field(default_factory=list)


class ApprovalQueueResponse(ORMModel):
    bookings: list[BookingResponse] = Field(default_factory=list)
    customers: list[dict] = Field(default_factory=list)
    pending_total: int = 0
