"""Tenant (organisation) — the isolation boundary of the multi-tenant platform."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import TenantPlan, TenantStatus
from app.db.base import Base, PkMixin, PublicIdMixin, TimestampMixin, UTCDateTime


class Tenant(Base, PkMixin, PublicIdMixin, TimestampMixin):
    """One customer organisation. Every business row points at exactly one tenant.

    The platform (super admin) manages tenants; tenant staff only ever see rows
    that carry their own ``tenant_id``.
    """

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(48), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=TenantStatus.ACTIVE.value, index=True
    )
    plan: Mapped[str] = mapped_column(String(16), nullable=False, default=TenantPlan.STANDARD.value)
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=25)

    contact_name: Mapped[str | None] = mapped_column(String(120))
    contact_email: Mapped[str | None] = mapped_column(String(190))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)

    suspended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    suspended_reason: Mapped[str | None] = mapped_column(String(255))

    @property
    def is_active(self) -> bool:
        return self.status == TenantStatus.ACTIVE.value
