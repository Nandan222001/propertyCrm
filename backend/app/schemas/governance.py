"""Governance schemas: users, roles, audit, notifications, settings, reports."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import Field, field_validator

from app.core.constants import Role, UserStatus
from app.core.validators import normalise_mobile, validate_email, validate_password
from app.schemas.common import ORMModel, SafeText, TimestampedResponse


class UserCreate(SafeText):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=254)
    phone: str | None = Field(default=None, max_length=20)
    role: Role
    title: str | None = Field(default=None, max_length=120)
    temporary_password: str = Field(min_length=8, max_length=128)
    agent_code: str | None = Field(default=None, max_length=16)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_mobile(value) if value else None

    @field_validator("temporary_password")
    @classmethod
    def _password(cls, value: str) -> str:
        return validate_password(value)


class UserUpdate(SafeText):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    title: str | None = Field(default=None, max_length=120)
    role: Role | None = None
    status: UserStatus | None = None
    agent_code: str | None = Field(default=None, max_length=16)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalise_mobile(value) if value else None


class UserResponse(TimestampedResponse):
    public_id: str
    name: str
    email: str
    phone: str | None = None
    role: str
    status: str
    title: str | None = None
    agent_code: str | None = None
    customer_id: int | None = None
    last_login_at: datetime | None = None
    failed_login_attempts: int = 0
    locked_until: datetime | None = None
    mfa_enabled: bool = False
    permissions: list[str] = Field(default_factory=list)
    extra_grants: list[dict] = Field(default_factory=list)


class PermissionGrantIn(SafeText):
    permission: str = Field(min_length=3, max_length=64)
    granted: bool = True
    reason: str | None = Field(default=None, max_length=255)


class PermissionGrantRequest(SafeText):
    grants: list[PermissionGrantIn] = Field(default_factory=list, max_length=100)


class RoleMatrixEntry(ORMModel):
    role: str
    label: str
    is_staff: bool
    permissions: list[str]


class AuditLogResponse(TimestampedResponse):
    actor_id: int | None = None
    actor_label: str | None = None
    actor_role: str | None = None
    action: str
    resource: str | None = None
    resource_id: str | None = None
    summary: str | None = None
    ip_address: str | None = None
    request_id: str | None = None
    occurred_at: datetime


class SecurityEventResponse(TimestampedResponse):
    event: str
    severity: str
    message: str | None = None
    actor_label: str | None = None
    ip_address: str | None = None
    acknowledged_at: datetime | None = None


class NotificationCreate(SafeText):
    title: str = Field(min_length=2, max_length=190)
    body: str | None = Field(default=None, max_length=2000)
    category: str = Field(default="FOLLOW_UP", max_length=32)
    severity: str = Field(default="info", pattern=r"^(info|warning|critical)$")
    audience_role: Role | None = None
    user_id: int | None = Field(default=None, gt=0)
    customer_id: int | None = Field(default=None, gt=0)
    booking_id: int | None = Field(default=None, gt=0)
    due_at: datetime | None = None


class NotificationResponse(TimestampedResponse):
    public_id: str
    title: str
    body: str | None = None
    category: str
    severity: str
    audience_role: str | None = None
    is_read: bool = False
    actioned_at: datetime | None = None
    due_at: datetime | None = None


class SettingUpdate(SafeText):
    value: str = Field(max_length=2000)
    description: str | None = Field(default=None, max_length=255)


class SettingResponse(TimestampedResponse):
    key: str
    value: str | None = None
    value_type: str
    category: str
    is_secret: bool = False
    description: str | None = None
    updated_by_id: int | None = None


class DashboardMetric(ORMModel):
    key: str
    label: str
    value: float
    unit: str = "INR"
    trend: float | None = None
    delta_label: str | None = None


class DashboardResponse(ORMModel):
    role: str
    metrics: list[DashboardMetric] = Field(default_factory=list)
    charts: dict[str, list[dict]] = Field(default_factory=dict)
    alerts: list[dict] = Field(default_factory=list)
    generated_at: datetime


class ReportRow(ORMModel):
    label: str
    values: dict[str, float | str | None] = Field(default_factory=dict)


class ReportResponse(ORMModel):
    report: str
    generated_at: datetime
    range: dict[str, date | None] = Field(default_factory=dict)
    # Report totals mix money, counts and reference strings (e.g. GSTIN).
    totals: dict[str, Any] = Field(default_factory=dict)
    rows: list[ReportRow] = Field(default_factory=list)
    csv_uri: str | None = None


class HealthResponse(ORMModel):
    status: str
    version: str
    environment: str
    uptime_seconds: float
    checks: dict[str, dict] = Field(default_factory=dict)
