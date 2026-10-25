"""Transaction details of the amount paid at booking.

Revision ID: f4e7a9b1d3c6
Revises: e3d6f8a0c2b5
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f4e7a9b1d3c6"
down_revision = "e3d6f8a0c2b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("token_payment_reference", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "token_payment_reference")
