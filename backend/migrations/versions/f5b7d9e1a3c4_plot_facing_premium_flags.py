"""North-East / East facing charges become features that are ticked on the plot, not worked out from its facing.

Existing plots keep the price they have today: a plot whose facing is East (or North-East) gets the matching tick.

Revision ID: f5b7d9e1a3c4
Revises: e4a6c8d0f2b3
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f5b7d9e1a3c4"
down_revision = "e4a6c8d0f2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("plots") as batch:
        batch.add_column(sa.Column("is_ne_facing", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("is_east_facing", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE plots SET is_east_facing = 1 WHERE LOWER(TRIM(facing)) = 'east'")
    op.execute("UPDATE plots SET is_ne_facing = 1 WHERE REPLACE(LOWER(TRIM(facing)), '-', ' ') IN ('north east', 'ne')")


def downgrade() -> None:
    with op.batch_alter_table("plots") as batch:
        batch.drop_column("is_east_facing")
        batch.drop_column("is_ne_facing")
