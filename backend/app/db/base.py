"""SQLAlchemy declarative base, conventions and shared mixins.

MySQL-specific safety:
* ``utf8mb4`` charset + ``InnoDB`` engine on every table (emoji/GST text safe,
  row-level transactions and foreign keys enforced);
* explicit naming convention so Alembic generates stable constraint names;
* ``TimestampMixin`` for audit columns and ``SoftDeleteMixin`` for records that
  must be retained for statutory retention (never hard-deleted, only flagged).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, MetaData, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column
from sqlalchemy.types import TypeDecorator

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

MYSQL_TABLE_ARGS = {
    "mysql_engine": "InnoDB",
    "mysql_charset": "utf8mb4",
    "mysql_collate": "utf8mb4_unicode_ci",
}


class UTCDateTime(TypeDecorator):
    """Timezone-safe datetime column.

    MySQL ``DATETIME`` has no timezone, so naive values are round-tripped by
    SQLAlchemy. This decorator stores UTC and always returns tz-aware datetimes,
    which removes an entire class of "can't compare naive and aware" bugs and
    keeps lockout/expiry comparisons correct.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp (never ``datetime.utcnow``, which is naive)."""
    return datetime.now(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    #: Applied to every table unless a model overrides ``__table_args__``.
    __table_args__ = MYSQL_TABLE_ARGS

    def to_dict(self, exclude: tuple[str, ...] = ()) -> dict:
        """Serialise columns without leaking internal/secret fields."""
        return {
            column.key: getattr(self, column.key)
            for column in self.__table__.columns
            if column.key not in exclude
        }


def uuid_str() -> str:
    return uuid.uuid4().hex


#: Human-readable prefixes per table, so every business reference looks like
#: ``BK-3F9A21C4`` instead of an opaque UUID. Declared once, used by every model.
PUBLIC_ID_PREFIXES = {
    "users": "USR",
    "customers": "CUS",
    "projects": "PRJ",
    "plots": "PLT",
    "bookings": "BKG",
    "payments": "PAY",
    "receipts": "RCT",
    "invoices": "INV",
    "agents": "AGT",
    "commissions": "COM",
    "documents": "DOC",
    "notifications": "NTF",
    "data_subject_requests": "DSR",
    "tenants": "TEN",
}


def generate_public_id(prefix: str) -> str:
    """Collision-resistant, sortable-ish public reference (never the primary key)."""
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


class PkMixin:
    """Monotonic numeric primary key (BM25-friendly, cheap FK joins)."""

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, comment="surrogate key")


class PublicIdMixin:
    """External-facing identifier (``USR-…``, ``BKG-…``) — never the primary key.

    The prefix comes from :data:`PUBLIC_ID_PREFIXES` (derived from the table
    name), so a new model gets a sensible identifier without extra wiring;
    models with bespoke numbering (bookings, receipts) set the value explicitly.
    """

    __public_id_prefix__: str | None = None

    @declared_attr
    def public_id(cls) -> Mapped[str]:
        prefix = (
            cls.__public_id_prefix__
            or PUBLIC_ID_PREFIXES.get(cls.__tablename__, "REF")
        )
        return mapped_column(
            String(32),
            unique=True,
            index=True,
            nullable=False,
            default=lambda: generate_public_id(prefix),
            comment="business reference",
        )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TenantMixin:
    """Row belongs to exactly one tenant (organisation). Required on business data.

    Isolation is enforced centrally in :mod:`app.db.tenancy` (a session-level
    query filter plus automatic stamping on insert), so repositories and
    services never write ``WHERE tenant_id = …`` by hand and cannot forget it.
    """

    @declared_attr
    def tenant_id(cls) -> Mapped[int]:
        return mapped_column(
            ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False, index=True,
            comment="owning tenant",
        )


class OptionalTenantMixin:
    """Tenant-scoped like :class:`TenantMixin`, but NULL means *platform-level*.

    Used where platform staff (super admins), pre-login events and platform audit
    entries legitimately have no tenant.
    """

    @declared_attr
    def tenant_id(cls) -> Mapped[int | None]:
        return mapped_column(
            ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=True, index=True,
            comment="owning tenant; NULL = platform",
        )


#: Marker bases the tenancy filter targets (both kinds are isolated).
TENANT_SCOPED = (TenantMixin, OptionalTenantMixin)


class SoftDeleteMixin:
    """Retention-friendly delete: rows stay queryable for audit/legal purposes."""

    # Boolean maps to TINYINT(1) on MySQL and INTEGER on SQLite (portable).
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False, index=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(String(32), nullable=True)

    def soft_delete(self, actor: str | None = None) -> None:
        self.is_deleted = True
        self.deleted_at = utcnow()
        self.deleted_by = actor
