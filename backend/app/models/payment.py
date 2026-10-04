"""Money-side domain: agents, commissions, payments, receipts and ledger."""

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

from app.core.constants import PaymentStatus
from app.db.base import Base, PkMixin, PublicIdMixin, SoftDeleteMixin, TimestampMixin, UTCDateTime


class Agent(Base, PkMixin, PublicIdMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "agents"

    code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(190))
    phone: Mapped[str | None] = mapped_column(String(20))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    commission_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.0200"), nullable=False)
    is_active: Mapped[str] = mapped_column(String(16), default="ACTIVE", nullable=False)

    customers = relationship("Customer", back_populates="agent", lazy="selectin")
    bookings = relationship("Booking", back_populates="agent", lazy="selectin")


class Commission(Base, PkMixin, PublicIdMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "commissions"

    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id", ondelete="SET NULL"), index=True)

    deal_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    tds_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)

    status: Mapped[str] = mapped_column(String(16), default="PAYABLE", nullable=False, index=True)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    payout_reference: Mapped[str | None] = mapped_column(String(80))
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    agent = relationship("Agent", lazy="joined")


class Payment(Base, PkMixin, PublicIdMixin, TimestampMixin, SoftDeleteMixin):
    """One collection event against a booking (the ledger's source of truth)."""

    __tablename__ = "payments"

    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    mode: Mapped[str] = mapped_column(String(24), nullable=False, default="UPI")
    reference: Mapped[str | None] = mapped_column(String(80))
    instrument_date: Mapped[date | None] = mapped_column(Date)
    received_on: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(
        String(24), default=PaymentStatus.PENDING.value, nullable=False, index=True
    )
    balance_after: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    booking = relationship("Booking", lazy="joined")
    receipt = relationship("Receipt", back_populates="payment", uselist=False, lazy="joined")


class Receipt(Base, PkMixin, PublicIdMixin, TimestampMixin):
    """Bill/receipt generated for a collection; supports office + customer copy."""

    __tablename__ = "receipts"

    receipt_number: Mapped[str] = mapped_column(String(24), nullable=False, unique=True, index=True)
    payment_id: Mapped[int] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"), nullable=False, index=True)

    issued_on: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    final_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    mode: Mapped[str] = mapped_column(String(24), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(80))
    is_shared_with_customer: Mapped[bool] = mapped_column(default=False, nullable=False)
    shared_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    pdf_key: Mapped[str | None] = mapped_column(String(255))

    payment = relationship("Payment", back_populates="receipt")

    __table_args__ = (
        UniqueConstraint("receipt_number", name="uq_receipts_receipt_number"),
    )
