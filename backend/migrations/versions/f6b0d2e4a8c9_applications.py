"""Applications: the application fee and enrollment fee taken before a plot is allotted.

Revision ID: f6b0d2e4a8c9
Revises: d4f8b1c3e5a7
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f6b0d2e4a8c9"
down_revision = "d4f8b1c3e5a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "applications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("receipt_number", sa.String(length=24), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=True),
        sa.Column("application_fee", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("enrollment_fee", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("payment_mode", sa.String(length=24), nullable=False),
        sa.Column("reference", sa.String(length=80), nullable=True),
        sa.Column("paid_to", sa.String(length=80), nullable=True),
        sa.Column("received_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="OPEN"),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("recorded_by_id", sa.Integer(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_id", name="uq_applications_public_id"),
    )
    for column in ("tenant_id", "receipt_number", "customer_id", "project_id", "agent_id", "received_on", "status", "booking_id", "is_deleted"):
        op.create_index(f"ix_applications_{column}", "applications", [column])

    # A payment scheme no longer carries the application, enrollment or allotment amounts: those are taken in
    # the two booking steps. Existing bookings keep their own schedule copies.
    op.execute("UPDATE payment_plans SET application_fee = 0, enrollment_fee = 0, allotment_amount = 0")


def downgrade() -> None:
    op.drop_table("applications")
