"""Customer schemas.

The same entity has two faces: internal staff see unmasked data only when they
hold ``pii:reveal`` (see ``services.customer_service.serialise``), the portal and
default list views get masked values.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.core.constants import ApprovalStatus
from app.core.validators import (
    normalise_mobile,
    validate_email,
    validate_gstin,
    validate_pan,
)
from app.schemas.common import ORMModel, SafeText, TimestampedResponse


class CustomerBase(SafeText):
    name: str = Field(min_length=2, max_length=120)
    legal_entity: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, pattern=r"^[1-9]\d{5}$")
    address: str | None = Field(default=None, max_length=2000)
    source: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=2000)
    marketing_opt_in: bool = False
    consent_given: bool = False
    consent_purpose: str | None = Field(default="Booking & statutory communication", max_length=160)


class CustomerCreate(CustomerBase):
    email: str = Field(max_length=254)
    phone: str = Field(max_length=20)
    pan_number: str | None = Field(default=None, max_length=10)
    kyc_reference: str | None = Field(default=None, max_length=60)
    agent_code: str | None = Field(default=None, max_length=16)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalise_mobile(value)

    @field_validator("pan_number")
    @classmethod
    def _pan(cls, value: str | None) -> str | None:
        return validate_pan(value) if value else None


class CustomerUpdate(SafeText):
    """Partial update — e-mail/phone keep their blind indexes in sync."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    legal_entity: str | None = Field(default=None, max_length=160)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, pattern=r"^[1-9]\d{5}$")
    address: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    source: str | None = Field(default=None, max_length=60)
    marketing_opt_in: bool | None = None
    consent_given: bool | None = None
    consent_purpose: str | None = Field(default=None, max_length=160)
    gstin: str | None = Field(default=None, max_length=15)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return validate_email(value) if value else None

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_mobile(value) if value else None

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, value: str | None) -> str | None:
        return validate_gstin(value) if value else None


class CustomerDecision(SafeText):
    """Approve/reject payload for the approval workflow."""

    reason: str | None = Field(default=None, max_length=255)
    status: ApprovalStatus


class CustomerResponse(TimestampedResponse):
    public_id: str
    name: str
    email: str | None = None
    phone: str | None = None
    city: str | None = None
    pincode: str | None = None
    address: str | None = None
    status: str
    source: str | None = None
    agent_id: int | None = None
    agent_name: str | None = None
    consent_given: bool = False
    marketing_opt_in: bool = False
    anonymised_at: datetime | None = None
    masked: bool = True
    booking_count: int | None = None
    outstanding: float | None = None


class CustomerConsentRecord(ORMModel):
    id: int
    purpose: str
    granted: bool
    policy_version: str
    captured_via: str | None = None
    created_at: datetime


class DataSubjectRequestCreate(SafeText):
    request_type: str = Field(pattern=r"^(ACCESS|CORRECTION|ERASURE|PORTABILITY)$")
    details: str | None = Field(default=None, max_length=2000)
    customer_public_id: str | None = Field(default=None, max_length=32)


class DataSubjectRequestResponse(TimestampedResponse):
    id: int
    customer_id: int | None = None
    request_type: str
    status: str
    due_by: datetime | None = None
    completed_at: datetime | None = None
    details: str | None = None
