"""Tenant plot map: the super admin links an interactive plot map to an organisation.

Revision ID: f8b2d4e6a0c1
Revises: e7a1c3d5f9b4
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f8b2d4e6a0c1"
down_revision = "e7a1c3d5f9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tenants") as batch:
        batch.add_column(sa.Column("plot_map", sa.String(40), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tenants") as batch:
        batch.drop_column("plot_map")
