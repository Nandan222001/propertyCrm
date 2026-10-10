"""Bookings remember their registration progress.

Revision ID: f6a3c9d1e8b2
Revises: e5f2b8c4d6a7
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f6a3c9d1e8b2"
down_revision = "e5f2b8c4d6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.add_column(sa.Column("registry_stage", sa.String(32), nullable=False, server_default="NOT_STARTED"))
    # Existing lifecycle states imply a stage.
    op.execute("UPDATE bookings SET registry_stage = 'AGREEMENT_SIGNED' WHERE status = 'AGREEMENT'")
    op.execute("UPDATE bookings SET registry_stage = 'REGISTERED' WHERE status = 'REGISTERED'")


def downgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.drop_column("registry_stage")
