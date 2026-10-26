"""A commission is earned on each customer payment.

Revision ID: b2d6f8a1c3e5
Revises: a1c5e7b9d2f4
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b2d6f8a1c3e5"
down_revision = "a1c5e7b9d2f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("commissions") as batch:
        batch.add_column(sa.Column("payment_id", sa.Integer(), nullable=True))
        batch.create_index("ix_commissions_payment_id", ["payment_id"])
        batch.create_foreign_key("fk_commissions_payment", "payments", ["payment_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("commissions") as batch:
        batch.drop_constraint("fk_commissions_payment", type_="foreignkey")
        batch.drop_index("ix_commissions_payment_id")
        batch.drop_column("payment_id")
