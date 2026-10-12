"""Retire the MANAGEMENT role: its users become administrators.

Revision ID: a7d4e1b9c3f5
Revises: f6a3c9d1e8b2
"""

from __future__ import annotations

from alembic import op

revision = "a7d4e1b9c3f5"
down_revision = "f6a3c9d1e8b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'ADMIN' WHERE role = 'MANAGEMENT'")


def downgrade() -> None:
    # The role no longer exists; converted users stay administrators.
    pass
