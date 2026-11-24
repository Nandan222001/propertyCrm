"""Customer schemas.

The same entity has two faces: internal staff see unmasked data only when they
hold ``pii:reveal`` (see ``services.customer_service.serialise``), the portal and
default list views get masked values.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field, field_validator

from app.core.constants import ApprovalStatus
from app.core.validators import (
    normalise_mobile,
    validate_email,
    validate_gstin,
    validate_pan,
)
from app.schemas.common import ORMModel, SafeText, TimestampedResponse


class _Place(SafeText):
    """An address block as printed on the application form."""

    address: str | None = Field(default=None, max_length=300)
    address2: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=60)
    pincode: str | None = Field(default=None, pattern=r"^[1-9]\d{5}$")

    @field_validator("pincode", mode="before")
    @classmethod
    def _blank_pin(cls, value):
        return None if value == "" else value


def _check_dob(value: str | None, label: str) -> str | None:
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"{label} must be a valid date") from None
    if parsed > date.today() or parsed.year < 1900:
        raise ValueError(f"{label} is not a valid date of birth")
    return parsed.isoformat()


class CustomerNominee(_Place):
    name: str | None = Field(default=None, max_length=120)
    relationship: str | None = Field(default=None, max_length=60)
    dob: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=254)

    @field_validator("dob", mode="before")
    @classmethod
    def _dob(cls, value):
        return _check_dob(value, "Nominee date of birth")

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return validate_email(value) if value else None


class CustomerProfile(SafeText):
    """Everything on the application form beyond the core customer fields.

    The communication address is the customer's own ``address`` / ``city`` / ``pincode`` plus ``address2`` and
    ``state`` here; the permanent address and the nominee are blocks of their own."""

    address2: str | None = Field(default=None, max_length=300)
    state: str | None = Field(default=None, max_length=60)
    passbook_no: str | None = Field(default=None, max_length=40)
    dob: str | None = Field(default=None, max_length=10)
    occupation: str | None = Field(default=None, max_length=80)
    guardian_name: str | None = Field(default=None, max_length=120)
    permanent: _Place | None = None
    nominee: CustomerNominee | None = None

    @field_validator("dob", mode="before")
    @classmethod
    def _dob(cls, value):
        return _check_dob(value, "Date of birth")


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
    profile: CustomerProfile | None = None
    agent_code: str | None = Field(default=None, max_length=16)
    project_id: int | None = Field(default=None, ge=1)

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
    profile: CustomerProfile | None = None

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
    project_id: int | None = None
    project_name: str | None = None
    consent_given: bool = False
    marketing_opt_in: bool = False
    anonymised_at: datetime | None = None
    profile: dict | None = None   # application-form details; only for roles that may reveal PII
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
