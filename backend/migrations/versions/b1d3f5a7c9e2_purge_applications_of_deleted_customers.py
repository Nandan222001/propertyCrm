"""Remove the applications (and their fees) left behind by customers deleted before deletes cascaded.

Revision ID: b1d3f5a7c9e2
Revises: a9c2e4f6b8d1
"""

from __future__ import annotations

from alembic import op

revision = "b1d3f5a7c9e2"
down_revision = "a9c2e4f6b8d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM applications WHERE customer_id IN (SELECT id FROM customers WHERE is_deleted = 1)"
    )


def downgrade() -> None:  # the erased rows cannot be restored
    pass
