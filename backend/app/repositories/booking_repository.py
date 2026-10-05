"""Booking repository with scope-aware queries used by the sales desk."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.core.constants import BookingStatus, PaymentStatus
from app.models.booking import Booking, BookingStatusHistory
from app.models.payment import Payment
from app.repositories.base_repository import BaseRepository

OPEN_STATUSES = (
    BookingStatus.PENDING_APPROVAL.value,
    BookingStatus.CONFIRMED.value,
    BookingStatus.AGREEMENT.value,
    BookingStatus.REGISTERED.value,
)


class BookingRepository(BaseRepository[Booking]):
    model = Booking
    searchable = ("booking_number", "payment_plan")
    sortable = {
        "id": Booking.id,
        "booking_number": Booking.booking_number,
        "booking_date": Booking.booking_date,
        "final_price": Booking.final_price,
        "status": Booking.status,
        "created_at": Booking.created_at,
    }
    default_sort = "booking_date"

    # ------------------------------------------------------------- scoping
    def scope_clause_for(self, *, agent_id: int | None, customer_id: int | None):
        """Row-level predicate: agents see their deals, customers see their own."""
        if customer_id is not None:
            return Booking.customer_id == customer_id
        if agent_id is not None:
            return Booking.agent_id == agent_id
        return None

    # ------------------------------------------------------------- queries
    def for_plot(self, plot_id: int, statuses: tuple[str, ...] = OPEN_STATUSES) -> Booking | None:
        stmt = (
            select(Booking)
            .where(Booking.plot_id == plot_id, Booking.status.in_(statuses), Booking.is_deleted == 0)
            .order_by(Booking.id.desc())
        )
        return self.db.execute(stmt).scalars().first()

    def pending_approval(self) -> list[Booking]:
        return self.list(filters={"status": BookingStatus.PENDING_APPROVAL.value}, sort="created_at:asc")

    def next_number(self, *, prefix: str, year: int) -> str:
        """Sequential business number — computed from the DB, not from the client."""
        like = f"{prefix}-{year}-%"
        stmt = select(func.max(Booking.booking_number)).where(Booking.booking_number.like(like))
        current = self.db.execute(stmt).scalar_one()
        sequence = int(str(current).rsplit("-", 1)[-1]) if current else 0
        return f"{prefix}-{year}-{sequence + 1:04d}"

    def status_counts(self, scope_clause=None) -> dict[str, int]:
        stmt = select(Booking.status, func.count(Booking.id)).where(Booking.is_deleted == 0)
        if scope_clause is not None:
            stmt = stmt.where(scope_clause)
        rows = self.db.execute(stmt.group_by(Booking.status)).all()
        summary = {status.value: 0 for status in BookingStatus}
        summary.update({str(status): int(total) for status, total in rows})
        return summary

    def totals(self, scope_clause=None) -> dict[str, Decimal]:
        stmt = select(
            func.coalesce(func.sum(Booking.final_price), 0),
            func.coalesce(func.sum(Booking.paid_amount), 0),
            func.count(Booking.id),
        ).where(Booking.is_deleted == 0, Booking.status.in_(OPEN_STATUSES))
        if scope_clause is not None:
            stmt = stmt.where(scope_clause)
        contract_value, collected, deals = self.db.execute(stmt).one()
        return {
            "contract_value": Decimal(str(contract_value or 0)),
            "collected": Decimal(str(collected or 0)),
            "outstanding": Decimal(str(contract_value or 0)) - Decimal(str(collected or 0)),
            "deals": Decimal(str(deals or 0)),
        }

    def overdue_payments(self, as_of: date | None = None) -> list[Payment]:
        today = as_of or date.today()
        stmt = (
            select(Payment)
            .where(
                Payment.is_deleted == 0,
                Payment.due_date.is_not(None),
                Payment.due_date < today,
                Payment.status.in_((PaymentStatus.PENDING.value, PaymentStatus.PARTIALLY_PAID.value)),
            )
            .order_by(Payment.due_date.asc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def refresh_paid_amount(self, booking: Booking, amount: Decimal) -> Booking:
        booking.paid_amount = (booking.paid_amount or Decimal("0")) + amount
        if booking.paid_amount >= booking.final_price:
            booking.status = BookingStatus.REGISTERED.value if booking.status == BookingStatus.REGISTERED.value else booking.status
        self.db.flush()
        return booking


class BookingStatusHistoryRepository(BaseRepository[BookingStatusHistory]):
    model = BookingStatusHistory
    sortable = {"id": BookingStatusHistory.id, "created_at": BookingStatusHistory.created_at}
    default_sort = "created_at"

    def for_booking(self, booking_id: int) -> list[BookingStatusHistory]:
        return self.list(filters={"booking_id": booking_id}, sort="created_at:desc")

    def record(
        self,
        *,
        booking_id: int,
        from_status: str | None,
        to_status: str,
        actor_id: int | None,
        actor_label: str | None,
        reason: str | None = None,
        ip_address: str | None = None,
    ) -> BookingStatusHistory:
        return self.create(
            BookingStatusHistory(
                booking_id=booking_id,
                from_status=from_status,
                to_status=to_status,
                changed_by_id=actor_id,
                changed_by_label=actor_label,
                reason=reason,
                ip_address=ip_address,
            )
        )
