"""Expenses can name the agent they paid (category "Agent payout").

Revision ID: d3f5b7c9e1a2
Revises: c2e4a6b8d0f1
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d3f5b7c9e1a2"
down_revision = "c2e4a6b8d0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("expenses") as batch:
        batch.add_column(sa.Column("agent_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_expenses_agent_id", "agents", ["agent_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_expenses_agent_id", ["agent_id"])


def downgrade() -> None:
    with op.batch_alter_table("expenses") as batch:
        batch.drop_index("ix_expenses_agent_id")
        batch.drop_constraint("fk_expenses_agent_id", type_="foreignkey")
        batch.drop_column("agent_id")
