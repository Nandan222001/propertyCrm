"""Application (step 1: application fee + enrollment fee) schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.core.validators import normalise_enum, to_date
from app.schemas.common import SafeText, TimestampedResponse


class ApplicationCreate(SafeText):
    customer_id: int = Field(gt=0)
    project_id: int = Field(gt=0)
    application_fee: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("100000000"))
    enrollment_fee: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("100000000"))
    payment_mode: str = Field(default="UPI", max_length=24)
    reference: str | None = Field(default=None, max_length=80)
    paid_to: str | None = Field(default=None, max_length=80)
    received_on: date | None = None

    @field_validator("received_on", mode="before")
    @classmethod
    def _date(cls, value):
        return to_date(value, field="date") if value else None

    @field_validator("payment_mode", mode="before")
    @classmethod
    def _mode(cls, value):
        from app.schemas.finance import PAYMENT_MODES

        return normalise_enum(value or "UPI", tuple(m for m in PAYMENT_MODES if m != "TOKEN_ADVANCE"), field="payment mode")

    @model_validator(mode="after")
    def _rules(self) -> ApplicationCreate:
        if self.application_fee + self.enrollment_fee <= 0:
            raise ValueError("enter the application fee and / or the enrollment fee received")
        return self


class ApplicationResponse(TimestampedResponse):
    public_id: str
    receipt_number: str
    customer_id: int
    customer_name: str | None = None
    project_id: int
    project_name: str | None = None
    agent_id: int | None = None
    application_fee: Decimal
    enrollment_fee: Decimal
    total: Decimal
    payment_mode: str
    reference: str | None = None
    paid_to: str | None = None
    received_on: date
    status: str
    booking_id: int | None = None
    booking_number: str | None = None
