"""Payment schemes (per project) and the instalment schedule each booking gets from one.

A scheme says how the *balance* of a plot's price is paid once the upfront amounts are in:
in one go within some days (OUTRIGHT), as equal monthly EMIs (EMI), or as regular EMIs plus larger
"special" EMIs in chosen months (EMI_SPECIAL). Every amount in a scheme is data entered by the admin.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, PkMixin, PublicIdMixin, SoftDeleteMixin, TenantMixin, TimestampMixin


class PaymentPlan(Base, PkMixin, PublicIdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "payment_plans"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)          # OUTRIGHT | EMI | EMI_SPECIAL

    # Paid at booking. The application fee is charged on top of the price; enrollment and allotment
    # count towards the price.
    application_fee: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    enrollment_fee: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
    allotment_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)

    #: Discount (%) on the balance that remains after enrollment and allotment.
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), nullable=False)

    outright_days: Mapped[int | None] = mapped_column(Integer)             # OUTRIGHT: pay the balance within N days
    emi_count: Mapped[int | None] = mapped_column(Integer)                 # EMI / EMI_SPECIAL: number of monthly EMIs
    special_count: Mapped[int | None] = mapped_column(Integer)             # EMI_SPECIAL: how many special EMIs
    special_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))  # EMI_SPECIAL: share of the balance
    special_months: Mapped[str | None] = mapped_column(Text)               # EMI_SPECIAL: JSON list of EMI numbers

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class BookingInstallment(Base, PkMixin, TenantMixin, TimestampMixin):
    """One line of a booking's payment schedule. Payments are applied to the earliest unpaid lines first."""

    __tablename__ = "booking_installments"

    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(60), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)          # UPFRONT | EMI | BALANCE
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"), nullable=False)
