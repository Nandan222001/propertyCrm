"""Who a payment was paid to (shown on the receipt).

Revision ID: a1c5e7b9d2f4
Revises: f4e7a9b1d3c6
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1c5e7b9d2f4"
down_revision = "f4e7a9b1d3c6"
branch_labels = None
depends_on = None

COLUMNS = (("bookings", "token_payment_paid_to"), ("payments", "paid_to"), ("receipts", "paid_to"))


def upgrade() -> None:
    for table, column in COLUMNS:
        op.add_column(table, sa.Column(column, sa.String(length=80), nullable=True))


def downgrade() -> None:
    for table, column in reversed(COLUMNS):
        op.drop_column(table, column)
