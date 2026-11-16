"""Agent hierarchy: sub-agents carved out of an agent's own commission rate.

Revision ID: e7a1c3d5f9b4
Revises: c4e6a8b0d2f3
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e7a1c3d5f9b4"
down_revision = "c4e6a8b0d2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("agents") as batch:
        batch.add_column(sa.Column("parent_agent_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("assigned_rate", sa.Numeric(5, 4), nullable=True))
        batch.create_index("ix_agents_parent_agent_id", ["parent_agent_id"])
        batch.create_foreign_key("fk_agents_parent", "agents", ["parent_agent_id"], ["id"], ondelete="SET NULL")
    with op.batch_alter_table("commissions") as batch:
        batch.add_column(sa.Column("source_agent_id", sa.Integer(), nullable=True))
        batch.create_index("ix_commissions_source_agent_id", ["source_agent_id"])
        batch.create_foreign_key("fk_commissions_source_agent", "agents", ["source_agent_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("commissions") as batch:
        batch.drop_constraint("fk_commissions_source_agent", type_="foreignkey")
        batch.drop_index("ix_commissions_source_agent_id")
        batch.drop_column("source_agent_id")
    with op.batch_alter_table("agents") as batch:
        batch.drop_constraint("fk_agents_parent", type_="foreignkey")
        batch.drop_index("ix_agents_parent_agent_id")
        batch.drop_column("assigned_rate")
        batch.drop_column("parent_agent_id")
