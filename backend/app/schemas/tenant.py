"""Tenant (organisation) schemas — the platform control plane."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import Field, field_validator

from app.core.constants import TenantPlan, TenantStatus
from app.core.validators import normalise_mobile, validate_email
from app.schemas.common import ORMModel, RequestModel, SafeText

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$")
RESERVED_SLUGS = {"platform", "admin", "api", "www", "app", "support", "root", "system"}


def _slug(value: str) -> str:
    slug = value.strip().lower()
    if not SLUG_RE.match(slug):
        raise ValueError("slug may contain lowercase letters, digits and hyphens (2-48 characters)")
    if slug in RESERVED_SLUGS:
        raise ValueError("this slug is reserved")
    return slug


class TenantAdminIn(RequestModel):
    """The organisation's first administrator."""

    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=254)
    #: Required: the starting password is built from the name and this number (never displayed).
    phone: str = Field(min_length=10, max_length=20)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalise_mobile(value)


class TenantCreate(SafeText):
    name: str = Field(min_length=2, max_length=160)
    slug: str | None = Field(default=None, max_length=48)
    plan: TenantPlan = TenantPlan.STANDARD
    max_users: int = Field(default=25, ge=1, le=10_000)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=190)
    contact_phone: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=2000)
    admin: TenantAdminIn

    @field_validator("slug")
    @classmethod
    def _slug_ok(cls, value: str | None) -> str | None:
        return _slug(value) if value else None

    @field_validator("contact_email")
    @classmethod
    def _contact_email(cls, value: str | None) -> str | None:
        return validate_email(value) if value else None

    @field_validator("contact_phone")
    @classmethod
    def _contact_phone(cls, value: str | None) -> str | None:
        return normalise_mobile(value) if value else None


class TenantUpdate(SafeText):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    plan: TenantPlan | None = None
    max_users: int | None = Field(default=None, ge=1, le=10_000)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=190)
    contact_phone: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("contact_email")
    @classmethod
    def _contact_email(cls, value: str | None) -> str | None:
        return validate_email(value) if value else None

    @field_validator("contact_phone")
    @classmethod
    def _contact_phone(cls, value: str | None) -> str | None:
        return normalise_mobile(value) if value else None


class TenantSuspend(SafeText):
    reason: str = Field(min_length=3, max_length=255)


class TenantUsage(ORMModel):
    users: int = 0
    projects: int = 0
    plots: int = 0
    customers: int = 0
    bookings: int = 0


class TenantResponse(ORMModel):
    id: int
    public_id: str
    name: str
    slug: str
    status: TenantStatus
    plan: TenantPlan
    max_users: int
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    notes: str | None = None
    suspended_at: datetime | None = None
    suspended_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    usage: TenantUsage = Field(default_factory=TenantUsage)
    #: E-mail of the organisation's first (oldest) administrator — shown in the tenant list.
    primary_admin_email: str | None = None


class TenantAdminResponse(ORMModel):
    id: int
    public_id: str
    name: str
    email: str
    phone: str | None = None
    status: str
    last_login_at: datetime | None = None
    must_change_password: bool = False


class TenantProvisioned(ORMModel):
    """Create / add-admin / reset result. The starting password is never part of any response."""

    tenant: TenantResponse
    admin: TenantAdminResponse
