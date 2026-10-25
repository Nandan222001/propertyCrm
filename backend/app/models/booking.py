"""Booking lifecycle + immutable status history (workflow audit trail)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    event,
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
    token_payment_mode: Mapped[str | None] = mapped_column(String(24))   # how the booking amount was paid (UPI, Cash…)
    token_payment_reference: Mapped[str | None] = mapped_column(String(80))   # its transaction id / cheque number
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)

    payment_plan: Mapped[str | None] = mapped_column(String(80))
    #: The scheme chosen at booking and the schedule it produced, frozen as agreed (later scheme edits never change it).
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("payment_plans.id", ondelete="SET NULL"), index=True)
    plan_snapshot: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(24), default=BookingStatus.PENDING_APPROVAL.value, nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    #: Registration progress (finer than the booking status): NOT_STARTED … REGISTERED.
    registry_stage: Mapped[str] = mapped_column(String(32), default="NOT_STARTED", nullable=False)

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

    #: Equals ``plot_id`` while the booking is live (pending, confirmed, agreement, registered) and NULL once it
    #: is rejected, cancelled or deleted. The UNIQUE index on it is what guarantees a plot holds at most one
    #: live booking — while rejected / cancelled / deleted bookings never block the plot.
    active_plot_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)

    __table_args__ = (
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


LIVE_BOOKING_STATUSES = frozenset({
    BookingStatus.PENDING_APPROVAL.value, BookingStatus.CONFIRMED.value,
    BookingStatus.AGREEMENT.value, BookingStatus.REGISTERED.value,
})


@event.listens_for(Booking, "before_insert")
@event.listens_for(Booking, "before_update")
def _sync_active_plot(_mapper, _connection, target: Booking) -> None:
    """Keep ``active_plot_id`` in step with the booking, whichever code path changed it."""
    live = target.status in LIVE_BOOKING_STATUSES and not target.is_deleted
    target.active_plot_id = target.plot_id if live else None
