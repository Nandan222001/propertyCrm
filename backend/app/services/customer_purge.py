"""Erase everything a customer owns — bookings, payments, receipts, applications, invoices, commissions earned on
their payments and the schedules behind them — and free the plots they held.

Their documents are the one thing that stays (the vault keeps the customer's files). The walk follows the foreign
keys from the customer, so a table added later is covered without touching this module; ``SET NULL`` links (audit
trail, notifications, agent links) are left for the database to null, and the audit log itself is never deleted.
"""

from __future__ import annotations

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.constants import PlotStatus
from app.db.base import Base

#: Tables that are never erased with the customer.
KEEP = {"documents", "audit_logs"}


def _owned_rows(db: Session, customer_id: int) -> dict[str, set]:
    """table name -> primary keys of the rows that belong (directly or through a booking/payment/…) to the customer."""
    tables = list(Base.metadata.sorted_tables)         # parents before children
    found: dict[str, set] = {"customers": {customer_id}}
    for table in tables:
        if table.name in KEEP or table.name == "customers" or len(table.primary_key.columns) != 1:
            continue
        pk = next(iter(table.primary_key.columns))
        for fk in table.foreign_keys:
            parent = fk.column.table.name
            if parent not in found or not found[parent] or (fk.ondelete or "").upper() == "SET NULL":
                continue
            ids = db.execute(select(pk).where(fk.parent.in_(found[parent]))).scalars().all()
            if ids:
                found.setdefault(table.name, set()).update(ids)
    return found


def purge_customer_data(db: Session, customer_id: int) -> dict[str, int]:
    """Delete the customer's dependent rows. Returns how many rows went from each table."""
    from app.models.payment import Commission
    from app.models.property import Plot

    found = _owned_rows(db, customer_id)
    booking_ids = found.get("bookings", set())
    payment_ids = found.get("payments", set())

    # Commissions earned on those deals are linked with SET NULL, so they would linger as orphans — remove them.
    if booking_ids or payment_ids:
        stmt = select(Commission.id).where(
            (Commission.booking_id.in_(booking_ids or {-1})) | (Commission.payment_id.in_(payment_ids or {-1})))
        found.setdefault("commissions", set()).update(db.execute(stmt).scalars().all())

    # Plots held by these bookings are free again.
    plot_ids = {row for row in db.execute(
        select(Base.metadata.tables["bookings"].c.plot_id).where(Base.metadata.tables["bookings"].c.id.in_(booking_ids or {-1}))
    ).scalars().all()}
    if plot_ids:
        db.execute(update(Plot).where(Plot.id.in_(plot_ids)).values(
            status=PlotStatus.AVAILABLE.value, customer_id=None, hold_expires_at=None))
    db.execute(update(Plot).where(Plot.customer_id == customer_id).values(
        status=PlotStatus.AVAILABLE.value, customer_id=None, hold_expires_at=None))

    removed: dict[str, int] = {}
    for table in reversed(Base.metadata.sorted_tables):      # children before parents
        ids = found.get(table.name)
        if table.name == "customers" or not ids or table.name in KEEP:
            continue
        pk = next(iter(table.primary_key.columns))
        result = db.execute(delete(table).where(pk.in_(ids)))
        removed[table.name] = int(result.rowcount or 0)
    db.flush()
    return removed
