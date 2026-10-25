"""Payment mode of the amount paid at booking.

Revision ID: e3d6f8a0c2b5
Revises: d2c5e7a9b1f4
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e3d6f8a0c2b5"
down_revision = "d2c5e7a9b1f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("token_payment_mode", sa.String(length=24), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "token_payment_mode")
