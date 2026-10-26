"""Plot numbers may carry a prefix of up to 30 characters.

Revision ID: c3e7a9b2d4f6
Revises: b2d6f8a1c3e5
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c3e7a9b2d4f6"
down_revision = "b2d6f8a1c3e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("plots") as batch:
        batch.alter_column("plot_number", existing_type=sa.String(length=24), type_=sa.String(length=40), existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("plots") as batch:
        batch.alter_column("plot_number", existing_type=sa.String(length=40), type_=sa.String(length=24), existing_nullable=False)
