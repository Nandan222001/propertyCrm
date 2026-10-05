"""Billing domain: tax invoices, line items and an immutable status history.

Money rules (mirrored by :mod:`app.services.billing_service`):
* every amount is ``Decimal`` end-to-end — never floats;
* totals are recomputed server-side from the line items on every write, so a
  tampered client payload can never change what the invoice bills;
* an invoice is soft-deleted, never hard-deleted (statutory retention);
* the status history is append-only, exactly like the booking workflow.
"""

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

from app.core.constants import InvoiceStatus
from app.db.base import Base, PkMixin, PublicIdMixin, SoftDeleteMixin, TimestampMixin, UTCDateTime


class Invoice(Base, PkMixin, PublicIdMixin, TimestampMixin, SoftDeleteMixin):
    """A tax invoice (bill) raised against a plot booking."""

    __tablename__ = "invoices"

    invoice_number: Mapped[str] = mapped_column(String(24), nullable=False, unique=True, index=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), index=True)

    issue_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(
        String(24), default=InvoiceStatus.DRAFT.value, nullable=False, index=True
    )

    # ------------------------------------------------------------- amounts
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    taxable_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.18"), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    cgst_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    sgst_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    round_off: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    balance_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)

    notes: Mapped[str | None] = mapped_column(Text)
    terms: Mapped[str | None] = mapped_column(Text)

    is_shared_with_customer: Mapped[bool] = mapped_column(default=False, nullable=False)
    shared_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    pdf_key: Mapped[str | None] = mapped_column(String(255))

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    issued_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    issued_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancellation_reason: Mapped[str | None] = mapped_column(String(255))

    booking = relationship("Booking", lazy="joined")
    customer = relationship("Customer", lazy="joined")
    agent = relationship("Agent", lazy="joined")
    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="InvoiceItem.id",
    )
    history = relationship(
        "InvoiceStatusHistory",
        back_populates="invoice",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="InvoiceStatusHistory.id.desc()",
    )

    __table_args__ = (
        UniqueConstraint("invoice_number", name="uq_invoices_invoice_number"),
    )


class InvoiceItem(Base, PkMixin, TimestampMixin):
    """One billed line: description, quantity, rate, discount and line total."""

    __tablename__ = "invoice_items"

    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    hsn_sac: Mapped[str | None] = mapped_column(String(16))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("1"), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="NOS", nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)

    invoice = relationship("Invoice", back_populates="items")

    @property
    def base_amount(self) -> Decimal:
        """Quantity times rate before the line discount."""
        return (self.quantity * self.unit_price).quantize(Decimal("0.01"))


class InvoiceStatusHistory(Base, PkMixin, TimestampMixin):
    """Append-only billing audit trail: who moved which invoice where, and why."""

    __tablename__ = "invoice_status_history"

    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(24))
    to_status: Mapped[str] = mapped_column(String(24), nullable=False)
    changed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    changed_by_label: Mapped[str | None] = mapped_column(String(120))
    reason: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(45))

    invoice = relationship("Invoice", back_populates="history")
