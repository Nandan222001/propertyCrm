"""Customer application-form details (personal + nominee) kept as one encrypted JSON profile.

Revision ID: c2e4a6b8d0f1
Revises: b1d3f5a7c9e2
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c2e4a6b8d0f1"
down_revision = "b1d3f5a7c9e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("customers") as batch:
        batch.add_column(sa.Column("profile", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("customers") as batch:
        batch.drop_column("profile")
