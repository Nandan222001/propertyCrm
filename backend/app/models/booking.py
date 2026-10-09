"""Booking lifecycle + immutable status history (workflow audit trail)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import BookingStatus
from app.db.base import (
    Base,
    PkMixin,
    PublicIdMixin,
    SoftDeleteMixin,
    TenantMixin,
    TimestampMixin,
    UTCDateTime,
)


class Booking(Base, PkMixin, PublicIdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "bookings"

    booking_number: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    plot_id: Mapped[int] = mapped_column(
        ForeignKey("plots.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), index=True)

    booking_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    final_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    token_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)

    payment_plan: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(
        String(24), default=BookingStatus.PENDING_APPROVAL.value, nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    rejection_reason: Mapped[str | None] = mapped_column(String(255))

    customer = relationship("Customer", back_populates="bookings", lazy="joined")
    project = relationship("Project", lazy="joined")
    plot = relationship("Plot", back_populates="bookings", lazy="joined")
    agent = relationship("Agent", lazy="joined")
    history = relationship(
        "BookingStatusHistory",
        back_populates="booking",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="BookingStatusHistory.id.desc()",
    )

    @property
    def balance(self) -> Decimal:
        return max(self.final_price - self.paid_amount, Decimal("0.00"))

    __table_args__ = (
        # A plot can hold at most one live booking.
        UniqueConstraint("plot_id", "status", name="uq_booking_plot_status"),
        UniqueConstraint("tenant_id", "booking_number", name="uq_bookings_tenant_booking_number"),
    )


class BookingStatusHistory(Base, PkMixin, TimestampMixin):
    """Append-only: every transition records who changed what and why."""

    __tablename__ = "booking_status_history"

    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(24))
    to_status: Mapped[str] = mapped_column(String(24), nullable=False)
    changed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    changed_by_label: Mapped[str | None] = mapped_column(String(120))
    reason: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(45))

    booking = relationship("Booking", back_populates="history")
