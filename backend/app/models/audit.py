"""Observability & governance tables: audit trail, security events, alerts.

These tables are append-only by design (the API never exposes update/delete).
The application's MySQL account is granted INSERT+SELECT only on them, so even a
compromised API process cannot rewrite history — see ``scripts/create_db.sql``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, PkMixin, PublicIdMixin, TimestampMixin, UTCDateTime, utcnow


class AuditLog(Base, PkMixin, TimestampMixin):
    """Business audit trail: who did what, to which record, from where."""

    __tablename__ = "audit_logs"

    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    actor_label: Mapped[str | None] = mapped_column(String(120))
    actor_role: Mapped[str | None] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    resource: Mapped[str | None] = mapped_column(String(48), index=True)
    resource_id: Mapped[str | None] = mapped_column(String(48), index=True)
    summary: Mapped[str | None] = mapped_column(String(255))
    before_state: Mapped[dict | None] = mapped_column(JSON)
    after_state: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    request_id: Mapped[str | None] = mapped_column(String(64), index=True)
    status_code: Mapped[int | None] = mapped_column(Integer)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)


class SecurityEvent(Base, PkMixin, TimestampMixin):
    """Anomaly / abuse signals consumed by alerting (docs/INCIDENT_RESPONSE.md)."""

    __tablename__ = "security_events"

    event: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), default="warning", nullable=False, index=True)
    message: Mapped[str | None] = mapped_column(Text)
    actor_label: Mapped[str | None] = mapped_column(String(190), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), index=True)
    path: Mapped[str | None] = mapped_column(String(190))
    context: Mapped[dict | None] = mapped_column(JSON)
    acknowledged_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    acknowledged_by: Mapped[str | None] = mapped_column(String(120))


class LoginAttempt(Base, PkMixin, TimestampMixin):
    """Every sign-in attempt (success **and** failure) for lockout + forensics."""

    __tablename__ = "login_attempts"

    email_hash: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    successful: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(80))
    ip_address: Mapped[str | None] = mapped_column(String(45), index=True)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)


class DataSubjectRequest(Base, PkMixin, TimestampMixin):
    """DPDP/GDPR request register (access, correction, erasure, portability)."""

    __tablename__ = "data_subject_requests"

    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True)
    request_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), default="RECEIVED", nullable=False, index=True)
    details: Mapped[str | None] = mapped_column(Text)
    requested_by_email_hash: Mapped[str | None] = mapped_column(String(80))
    handled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    due_by: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class AppSetting(Base, PkMixin, TimestampMixin):
    """Runtime configuration with change history (who flipped the switch)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    value: Mapped[str | None] = mapped_column(Text)
    value_type: Mapped[str] = mapped_column(String(16), default="string", nullable=False)
    category: Mapped[str] = mapped_column(String(48), default="general", index=True)
    is_secret: Mapped[bool] = mapped_column(default=False, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class Notification(Base, PkMixin, PublicIdMixin, TimestampMixin):
    """Follow-up queue: reminders, approvals, overdue alerts per role/owner."""

    __tablename__ = "notifications"

    title: Mapped[str] = mapped_column(String(190), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32), default="FOLLOW_UP", index=True)
    severity: Mapped[str] = mapped_column(String(16), default="info", index=True)
    audience_role: Mapped[str | None] = mapped_column(String(32), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    is_read: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    actioned_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    actioned_by: Mapped[str | None] = mapped_column(String(120))
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
