"""Application queries."""

from __future__ import annotations

from sqlalchemy import Select, func, select

from app.models.application import Application
from app.models.customer import Customer
from app.repositories.base_repository import BaseRepository


class ApplicationRepository(BaseRepository[Application]):
    model = Application
    searchable = ("receipt_number", "reference")
    sortable = {
        "id": Application.id,
        "received_on": Application.received_on,
        "created_at": Application.created_at,
        "status": Application.status,
    }
    default_sort = "received_on"

    def _base_query(self, include_deleted: bool = False) -> Select:
        """An application belongs to its customer: once the customer is deleted it is gone from every list."""
        stmt = super()._base_query(include_deleted)
        if include_deleted:
            return stmt
        return stmt.where(Application.customer_id.in_(select(Customer.id).where(Customer.is_deleted.is_(False))))

    def next_number(self, *, year: int) -> str:
        """``APP-2026-0001`` — its own series, separate from the payment receipts."""
        like = f"APP-{year}-%"
        current = self.db.execute(select(func.max(Application.receipt_number)).where(Application.receipt_number.like(like))).scalar_one()
        sequence = int(str(current).rsplit("-", 1)[-1]) if current else 0
        return f"APP-{year}-{sequence + 1:04d}"
