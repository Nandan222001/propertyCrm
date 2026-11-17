"""Receipt date chosen at allotment, and the payment type (Allotment) shown on the receipt.

Revision ID: a9c2e4f6b8d1
Revises: f8b2d4e6a0c1
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a9c2e4f6b8d1"
down_revision = "f8b2d4e6a0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("token_payment_received_on", sa.Date(), nullable=True))
    op.add_column("payments", sa.Column("payment_type", sa.String(length=40), nullable=True))
    # Receipts already issued for the amount paid at booking were auto-generated with these notes.
    op.execute(
        "UPDATE payments SET payment_type = 'Allotment' "
        "WHERE notes IN ('Auto-generated token receipt', 'Token receipt on approval')"
    )


def downgrade() -> None:
    op.drop_column("payments", "payment_type")
    op.drop_column("bookings", "token_payment_received_on")
