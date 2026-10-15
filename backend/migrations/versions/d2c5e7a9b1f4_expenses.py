"""Company expenses (accounts team) for the profit-till-date figure.

Revision ID: d2c5e7a9b1f4
Revises: c9a3d5e7f1b2
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d2c5e7a9b1f4"
down_revision = "c9a3d5e7f1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("paid_to", sa.String(length=120), nullable=True),
        sa.Column("payment_mode", sa.String(length=24), nullable=True),
        sa.Column("reference", sa.String(length=80), nullable=True),
        sa.Column("recorded_by_id", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_id", name="uq_expenses_public_id"),
    )
    op.create_index("ix_expenses_tenant_id", "expenses", ["tenant_id"])
    op.create_index("ix_expenses_category", "expenses", ["category"])
    op.create_index("ix_expenses_expense_date", "expenses", ["expense_date"])
    op.create_index("ix_expenses_is_deleted", "expenses", ["is_deleted"])


def downgrade() -> None:
    op.drop_table("expenses")
