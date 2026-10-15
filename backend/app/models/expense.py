"""Company expenses recorded by the accounts team (rent, salaries, marketing, …)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, PkMixin, PublicIdMixin, SoftDeleteMixin, TenantMixin, TimestampMixin


class Expense(Base, PkMixin, PublicIdMixin, TenantMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "expenses"

    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    paid_to: Mapped[str | None] = mapped_column(String(120))
    payment_mode: Mapped[str | None] = mapped_column(String(24))
    reference: Mapped[str | None] = mapped_column(String(80))
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
