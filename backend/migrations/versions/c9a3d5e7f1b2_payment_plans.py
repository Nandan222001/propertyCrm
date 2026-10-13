"""Payment schemes per project, project premiums, plot features and booking instalment schedules.

Revision ID: c9a3d5e7f1b2
Revises: b8e2f4a6d1c3
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c9a3d5e7f1b2"
down_revision = "b8e2f4a6d1c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("application_fee", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("enrollment_fee", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("allotment_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("outright_days", sa.Integer(), nullable=True),
        sa.Column("emi_count", sa.Integer(), nullable=True),
        sa.Column("special_count", sa.Integer(), nullable=True),
        sa.Column("special_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("special_months", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_id", name="uq_payment_plans_public_id"),
    )
    op.create_index("ix_payment_plans_project_id", "payment_plans", ["project_id"])
    op.create_index("ix_payment_plans_tenant_id", "payment_plans", ["tenant_id"])
    op.create_index("ix_payment_plans_is_deleted", "payment_plans", ["is_deleted"])

    op.create_table(
        "booking_installments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=60), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_booking_installments_booking_id", "booking_installments", ["booking_id"])
    op.create_index("ix_booking_installments_tenant_id", "booking_installments", ["tenant_id"])

    with op.batch_alter_table("projects") as batch:
        for column in ("premium_commercial", "premium_corner", "premium_ne_facing", "premium_east_facing", "premium_park_facing"):
            batch.add_column(sa.Column(column, sa.Numeric(18, 2), nullable=True))
    with op.batch_alter_table("plots") as batch:
        for column in ("is_corner", "is_commercial", "is_park_facing"):
            batch.add_column(sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("bookings") as batch:
        batch.add_column(sa.Column("plan_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("plan_snapshot", sa.Text(), nullable=True))
        batch.create_index("ix_bookings_plan_id", ["plan_id"])
        batch.create_foreign_key("fk_bookings_plan_id_payment_plans", "payment_plans", ["plan_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("bookings") as batch:
        batch.drop_constraint("fk_bookings_plan_id_payment_plans", type_="foreignkey")
        batch.drop_index("ix_bookings_plan_id")
        batch.drop_column("plan_snapshot")
        batch.drop_column("plan_id")
    with op.batch_alter_table("plots") as batch:
        for column in ("is_park_facing", "is_commercial", "is_corner"):
            batch.drop_column(column)
    with op.batch_alter_table("projects") as batch:
        for column in ("premium_park_facing", "premium_east_facing", "premium_ne_facing", "premium_corner", "premium_commercial"):
            batch.drop_column(column)
    op.drop_table("booking_installments")
    op.drop_table("payment_plans")
