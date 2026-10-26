"""Step 1 of a booking: the customer pays the application fee and enrollment fee, before any plot is allotted."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PkMixin, PublicIdMixin, SoftDeleteMixin, TenantMixin, TimestampMixin


class Application(Base, PkMixin, PublicIdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    """The fees are the company's own and are never adjusted against a plot's price."""

    __tablename__ = "applications"

    receipt_number: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True)
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), index=True)
    application_fee: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    enrollment_fee: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    payment_type: Mapped[str] = mapped_column(String(40), nullable=False, default="Application Fee + Enrollment")
    payment_mode: Mapped[str] = mapped_column(String(24), nullable=False, default="UPI")
    reference: Mapped[str | None] = mapped_column(String(80))
    paid_to: Mapped[str | None] = mapped_column(String(80))
    received_on: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    #: OPEN until the customer is allotted a plot, then ALLOTTED (with the booking that did it).
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN", index=True)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id", ondelete="SET NULL"), index=True)
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    customer = relationship("Customer", lazy="joined")
    project = relationship("Project", lazy="joined")
    booking = relationship("Booking", lazy="joined")

    @property
    def total(self) -> Decimal:
        return Decimal(self.application_fee) + Decimal(self.enrollment_fee)
