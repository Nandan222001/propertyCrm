"""A plot may hold one *live* booking; rejected, cancelled and deleted bookings no longer block it.

The old rule (UNIQUE plot_id + status) meant a deleted pending booking blocked any new pending booking for
the same plot, and a plot could be rejected or cancelled only once. ``active_plot_id`` is the plot while the
booking is live and NULL otherwise; a UNIQUE index on it enforces exactly "one live booking per plot".

Revision ID: b8e2f4a6d1c3
Revises: a7d4e1b9c3f5
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b8e2f4a6d1c3"
down_revision = "a7d4e1b9c3f5"
branch_labels = None
depends_on = None

LIVE = "('PENDING_APPROVAL', 'CONFIRMED', 'AGREEMENT', 'REGISTERED')"


def upgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.add_column(sa.Column("active_plot_id", sa.Integer(), nullable=True))
    op.execute(f"UPDATE bookings SET active_plot_id = plot_id WHERE is_deleted = 0 AND status IN {LIVE}")
    with op.batch_alter_table("bookings") as batch:
        batch.create_unique_constraint("uq_bookings_active_plot_id", ["active_plot_id"])
        batch.drop_constraint("uq_booking_plot_status", type_="unique")


def downgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.create_unique_constraint("uq_booking_plot_status", ["plot_id", "status"])
        batch.drop_constraint("uq_bookings_active_plot_id", type_="unique")
        batch.drop_column("active_plot_id")
