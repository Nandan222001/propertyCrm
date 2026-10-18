"""Agents, commissions, payments and receipts repositories."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import and_, func, select

from app.core.constants import PaymentStatus
from app.models.payment import Agent, Commission, Payment, Receipt
from app.repositories.base_repository import BaseRepository


class AgentRepository(BaseRepository[Agent]):
    model = Agent
    searchable = ("name", "code", "email")
    sortable = {"id": Agent.id, "name": Agent.name, "code": Agent.code}
    default_sort = "name"

    def get_by_code(self, code: str) -> Agent | None:
        return self.get_by(code=(code or "").strip().upper())

    def get_by_user(self, user_id: int) -> Agent | None:
        return self.get_by(user_id=user_id)

    def leaderboard(self, *, limit: int = 20) -> list[dict]:
        """One aggregate query per metric — no per-agent round trips."""
        from app.models.booking import Booking

        stmt = (
            select(
                Agent.id,
                Agent.code,
                Agent.name,
                func.count(Booking.id).label("deals"),
                func.coalesce(func.sum(Booking.final_price), 0).label("sales"),
                func.coalesce(func.sum(Booking.paid_amount), 0).label("collected"),
            )
            # Only deals that still count: a deleted, rejected, cancelled or still-pending booking is not a sale.
            .join(Booking, and_(
                Booking.agent_id == Agent.id,
                Booking.is_deleted.is_(False),
                Booking.status.in_(("CONFIRMED", "AGREEMENT", "REGISTERED")),
            ), isouter=True)
            .where(Agent.is_deleted == 0)
            .group_by(Agent.id, Agent.code, Agent.name)
            .order_by(func.coalesce(func.sum(Booking.final_price), 0).desc())
            .limit(limit)
        )
        return [dict(row._mapping) for row in self.db.execute(stmt).all()]


class CommissionRepository(BaseRepository[Commission]):
    model = Commission
    sortable = {
        "id": Commission.id,
        "created_at": Commission.created_at,
        "net_amount": Commission.net_amount,
        "status": Commission.status,
    }
    default_sort = "created_at"

    def for_agent(self, agent_id: int) -> list[Commission]:
        return self.list(filters={"agent_id": agent_id}, sort="created_at:desc")

    def totals(self, scope_clause=None) -> dict[str, Decimal]:
        stmt = select(
            func.coalesce(func.sum(Commission.gross_amount), 0),
            func.coalesce(func.sum(Commission.net_amount), 0),
            func.coalesce(func.sum(Commission.tds_amount), 0),
        )
        if scope_clause is not None:
            stmt = stmt.where(scope_clause)
        gross, net, tds = self.db.execute(stmt).one()
        return {
            "gross": Decimal(str(gross or 0)),
            "net": Decimal(str(net or 0)),
            "tds": Decimal(str(tds or 0)),
        }

    def payable(self) -> list[Commission]:
        return self.list(filters={"status": "PAYABLE"}, sort="created_at:asc")


class PaymentRepository(BaseRepository[Payment]):
    model = Payment
    searchable = ("reference", "mode")
    sortable = {
        "id": Payment.id,
        "received_on": Payment.received_on,
        "amount": Payment.amount,
        "due_date": Payment.due_date,
        "status": Payment.status,
    }
    default_sort = "received_on"

    def scope_clause_for(self, *, customer_id: int | None, agent_id: int | None):
        from app.models.booking import Booking

        if customer_id is not None:
            return Payment.customer_id == customer_id
        if agent_id is not None:
            # payments belong to bookings, so scope through the booking table
            booking_ids = select(Booking.id).where(Booking.agent_id == agent_id)
            return Payment.booking_id.in_(booking_ids)
        return None

    def total_collected(self, scope_clause=None) -> Decimal:
        stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.is_deleted == 0)
        if scope_clause is not None:
            stmt = stmt.where(scope_clause)
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))

    def collected_between(self, start: date, end: date) -> Decimal:
        stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.is_deleted == 0, Payment.received_on.between(start, end)
        )
        return Decimal(str(self.db.execute(stmt).scalar_one() or 0))

    def aging_buckets(self, as_of: date | None = None) -> dict[str, Decimal]:
        """Receivables ageing (0-30 / 31-60 / 61-90 / 90+) for the finance desk."""
        today = as_of or date.today()
        buckets = {"current": Decimal("0"), "0-30": Decimal("0"), "31-60": Decimal("0"),
                   "61-90": Decimal("0"), "90+": Decimal("0")}
        stmt = select(Payment.due_date, Payment.amount).where(
            Payment.is_deleted == 0,
            Payment.status.in_((PaymentStatus.PENDING.value, PaymentStatus.PARTIALLY_PAID.value)),
        )
        for due_date, amount in self.db.execute(stmt).all():
            amount = Decimal(str(amount or 0))
            if not due_date or due_date >= today:
                buckets["current"] += amount
                continue
            age = (today - due_date).days
            key = "0-30" if age <= 30 else "31-60" if age <= 60 else "61-90" if age <= 90 else "90+"
            buckets[key] += amount
        return buckets

    def mark_overdue(self, as_of: date | None = None) -> int:
        """Scheduled job: flip pending/partial rows past their due date to OVERDUE."""
        today = as_of or date.today()
        from sqlalchemy import update

        result = self.db.execute(
            update(Payment)
            .where(
                Payment.due_date.is_not(None),
                Payment.due_date < today,
                Payment.status.in_((PaymentStatus.PENDING.value, PaymentStatus.PARTIALLY_PAID.value)),
                Payment.is_deleted == 0,
            )
            .values(status=PaymentStatus.OVERDUE.value)
        )
        return int(result.rowcount or 0)


class ReceiptRepository(BaseRepository[Receipt]):
    model = Receipt
    searchable = ("receipt_number", "mode", "reference")
    sortable = {
        "id": Receipt.id,
        "issued_on": Receipt.issued_on,
        "amount": Receipt.amount,
        "receipt_number": Receipt.receipt_number,
    }
    default_sort = "issued_on"

    def next_number(self, *, year: int) -> str:
        from app.services.org_settings import get_value

        prefix = get_value(self.db, "tax.receiptPrefix", "RCT").upper()
        like = f"{prefix}-{year}-%"
        current = self.db.execute(
            select(func.max(Receipt.receipt_number)).where(Receipt.receipt_number.like(like))
        ).scalar_one()
        sequence = int(str(current).rsplit("-", 1)[-1]) if current else 200
        return f"{prefix}-{year}-{sequence + 1:04d}"

    def mark_shared(self, receipt: Receipt) -> Receipt:
        from app.db.base import utcnow

        receipt.is_shared_with_customer = True
        receipt.shared_at = utcnow()
        self.db.flush()
        return receipt
