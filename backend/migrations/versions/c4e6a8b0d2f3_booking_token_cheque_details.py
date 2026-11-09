"""Cheque bank name and date captured on the booking, for the amount paid at booking.

Revision ID: c4e6a8b0d2f3
Revises: b3d5f7a9c1e2
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c4e6a8b0d2f3"
down_revision = "b3d5f7a9c1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("token_payment_bank_name", sa.String(length=80), nullable=True))
    op.add_column("bookings", sa.Column("token_payment_instrument_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "token_payment_instrument_date")
    op.drop_column("bookings", "token_payment_bank_name")
