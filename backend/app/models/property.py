"""Inventory domain: projects, plots and document vault."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import DocumentKind, PlotStatus
from app.db.base import (
    Base,
    PkMixin,
    PublicIdMixin,
    SoftDeleteMixin,
    TenantMixin,
    TimestampMixin,
    UTCDateTime,
)


class Project(Base, PkMixin, PublicIdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phase: Mapped[str | None] = mapped_column(String(60))
    city: Mapped[str | None] = mapped_column(String(80), index=True)
    state: Mapped[str | None] = mapped_column(String(80))
    location: Mapped[str | None] = mapped_column(String(160))
    rera_number: Mapped[str | None] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(Text)

    total_plots: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    base_rate_per_sqft: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    estimated_revenue: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    launch_date: Mapped[date | None] = mapped_column(Date)
    completion_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Extra charge per plot, added to its price when the plot has that feature (all optional).
    premium_commercial: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    premium_corner: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    premium_ne_facing: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    premium_east_facing: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    premium_park_facing: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))

    plots = relationship("Plot", back_populates="project", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_projects_tenant_name"),
    )


class Plot(Base, PkMixin, PublicIdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "plots"

    plot_number: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    layout: Mapped[str | None] = mapped_column(String(80))
    area_sqft: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    facing: Mapped[str | None] = mapped_column(String(24))
    price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default=PlotStatus.AVAILABLE.value, nullable=False, index=True
    )
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"))
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    hold_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Features that carry a premium (see the project's premium_* amounts).
    is_corner: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_commercial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_park_facing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project = relationship("Project", back_populates="plots", lazy="joined")
    bookings = relationship("Booking", back_populates="plot", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("project_id", "plot_number", name="uq_plot_project_number"),
    )


class Document(Base, PkMixin, PublicIdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    """Metadata for the document vault; files live in encrypted object storage."""

    __tablename__ = "documents"

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), default=DocumentKind.OTHER.value, index=True)
    file_key: Mapped[str | None] = mapped_column(String(255))     # S3 key (SSE-KMS encrypted)
    content_type: Mapped[str | None] = mapped_column(String(80))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))
    is_shared_with_customer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), index=True
    )
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    customer = relationship("Customer", back_populates="documents")
