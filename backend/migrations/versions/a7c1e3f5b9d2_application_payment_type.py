"""Applications: the payment type chosen when the step-1 money is received.

Revision ID: a7c1e3f5b9d2
Revises: f6b0d2e4a8c9
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a7c1e3f5b9d2"
down_revision = "f6b0d2e4a8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("applications") as batch:
        batch.add_column(sa.Column("payment_type", sa.String(length=40), nullable=False,
                                   server_default="Application Fee + Enrollment"))


def downgrade() -> None:
    with op.batch_alter_table("applications") as batch:
        batch.drop_column("payment_type")
