"""User, role grants and refresh-token models."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import Role, UserStatus
from app.db.base import (
    Base,
    OptionalTenantMixin,
    PkMixin,
    PublicIdMixin,
    SoftDeleteMixin,
    TimestampMixin,
    UTCDateTime,
    utcnow,
)


class User(Base, PkMixin, PublicIdMixin, OptionalTenantMixin, TimestampMixin, SoftDeleteMixin):
    """Staff, agent and customer-portal accounts in one identity table.

    The ``role`` column is the coarse boundary; fine-grained behaviour comes from
    :data:`app.core.constants.ROLE_PERMISSIONS` plus optional per-user grants.
    """

    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(190), nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(
        String(32), nullable=False, default=Role.SALES_AGENT.value, index=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=UserStatus.ACTIVE.value, index=True
    )

    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_changed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # brute-force protection
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_login_ip: Mapped[str | None] = mapped_column(String(45))

    # MFA is modelled now so enabling TOTP later needs no migration
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret_encrypted: Mapped[str | None] = mapped_column(String(255))

    # customer-portal link (a CUSTOMER user maps to exactly one customer row)
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    agent_code: Mapped[str | None] = mapped_column(String(16), index=True)

    # GDPR/DPDP
    consent_given_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    data_anonymised_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    grants: Mapped[list[UserPermissionGrant]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    tokens: Mapped[list[AuthToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
    )

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE.value

    @property
    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > utcnow())


class UserPermissionGrant(Base, PkMixin, TimestampMixin):
    """Extra grant/revoke on top of the declarative role matrix."""

    __tablename__ = "user_permission_grants"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permission: Mapped[str] = mapped_column(String(64), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    granted_by: Mapped[str | None] = mapped_column(String(32))
    reason: Mapped[str | None] = mapped_column(String(255))

    user: Mapped[User] = relationship(back_populates="grants")

    __table_args__ = (
        UniqueConstraint("user_id", "permission", name="uq_user_permission"),
    )


class AuthToken(Base, PkMixin, TimestampMixin):
    """Refresh / reset tokens stored as digests only (a DB dump is not a login)."""

    __tablename__ = "auth_tokens"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_digest: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(24), nullable=False, default="refresh")
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    rotated_to: Mapped[str | None] = mapped_column(String(80))
    issued_ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))

    user: Mapped[User] = relationship(back_populates="tokens")

    @property
    def is_usable(self) -> bool:
        return self.revoked_at is None and self.expires_at > utcnow()
