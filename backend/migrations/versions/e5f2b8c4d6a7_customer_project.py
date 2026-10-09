"""Customers remember the project they were added for.

A project's customer directory lists only its own customers, including ones that
have no booking yet (for example while awaiting admin approval).

Revision ID: e5f2b8c4d6a7
Revises: d4e8a1c2f3b5
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e5f2b8c4d6a7"
down_revision = "d4e8a1c2f3b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("customers") as batch:
        batch.add_column(sa.Column("project_id", sa.Integer(), nullable=True))
        batch.create_index("ix_customers_project_id", ["project_id"])
        batch.create_foreign_key(
            "fk_customers_project_id", "projects", ["project_id"], ["id"], ondelete="SET NULL"
        )
    # Backfill from existing bookings: the project of the customer's first booking.
    op.execute(
        "UPDATE customers SET project_id = ("
        " SELECT b.project_id FROM bookings b"
        " WHERE b.customer_id = customers.id ORDER BY b.id LIMIT 1)"
        " WHERE project_id IS NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table("customers") as batch:
        batch.drop_constraint("fk_customers_project_id", type_="foreignkey")
        batch.drop_index("ix_customers_project_id")
        batch.drop_column("project_id")
