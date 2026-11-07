"""Bank name for cheque payments (the cheque date uses payments.instrument_date).

Revision ID: b3d5f7a9c1e2
Revises: a7c1e3f5b9d2
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b3d5f7a9c1e2"
down_revision = "a7c1e3f5b9d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("bank_name", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "bank_name")
