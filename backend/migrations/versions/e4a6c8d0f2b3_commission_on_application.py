"""Commission can be earned on the enrollment fee of an application (no booking or payment yet).

Revision ID: e4a6c8d0f2b3
Revises: d3f5b7c9e1a2
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e4a6c8d0f2b3"
down_revision = "d3f5b7c9e1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("commissions") as batch:
        batch.add_column(sa.Column("application_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_commissions_application_id", "applications", ["application_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_commissions_application_id", ["application_id"])


def downgrade() -> None:
    with op.batch_alter_table("commissions") as batch:
        batch.drop_index("ix_commissions_application_id")
        batch.drop_constraint("fk_commissions_application_id", type_="foreignkey")
        batch.drop_column("application_id")
