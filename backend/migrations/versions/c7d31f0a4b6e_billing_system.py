"""Billing system: invoices, invoice items, invoice status history.

Adds the tax-invoice tables (header totals, line items, append-only status
timeline) and links the payments ledger to the invoice it settles via a
nullable ``payments.invoice_id`` FK (SET NULL — an invoice deletion never
orphan-ages the statutory payment record).

Revision ID: c7d31f0a4b6e
Revises: b1f4c9a77d21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c7d31f0a4b6e"
down_revision = "b1f4c9a77d21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False, comment="surrogate key"),
        sa.Column("public_id", sa.String(length=32), nullable=False, comment="business reference"),
        sa.Column("invoice_number", sa.String(length=24), nullable=False),
        sa.Column(
            "booking_id", sa.Integer(), nullable=False,
            comment="bill is raised against a plot booking",
        ),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("subtotal", sa.Numeric(18, 2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("taxable_value", sa.Numeric(18, 2), nullable=False),
        sa.Column("gst_rate", sa.Numeric(5, 4), nullable=False),
        sa.Column("gst_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("cgst_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("sgst_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("round_off", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("amount_paid", sa.Numeric(18, 2), nullable=False),
        sa.Column("balance_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("terms", sa.Text(), nullable=True),
        sa.Column("is_shared_with_customer", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("shared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pdf_key", sa.String(length=255), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("issued_by_id", sa.Integer(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by_id", sa.Integer(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.String(length=255), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_invoices"),
        sa.UniqueConstraint("invoice_number", name="uq_invoices_invoice_number"),
        sa.UniqueConstraint("public_id", name="uq_invoices_public_id"),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"],
            name="fk_invoices_booking_id_bookings", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customers.id"],
            name="fk_invoices_customer_id_customers", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"], ["agents.id"], name="fk_invoices_agent_id_agents", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], name="fk_invoices_created_by_id_users", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["issued_by_id"], ["users.id"], name="fk_invoices_issued_by_id_users", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["cancelled_by_id"], ["users.id"], name="fk_invoices_cancelled_by_id_users", ondelete="SET NULL",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_invoices_public_id", "invoices", ["public_id"], unique=True)
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"], unique=True)
    op.create_index("ix_invoices_booking_id", "invoices", ["booking_id"])
    op.create_index("ix_invoices_customer_id", "invoices", ["customer_id"])
    op.create_index("ix_invoices_agent_id", "invoices", ["agent_id"])
    op.create_index("ix_invoices_issue_date", "invoices", ["issue_date"])
    op.create_index("ix_invoices_due_date", "invoices", ["due_date"])
    op.create_index("ix_invoices_status", "invoices", ["status"])
    op.create_index("ix_invoices_is_deleted", "invoices", ["is_deleted"])

    op.create_table(
        "invoice_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False, comment="surrogate key"),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("hsn_sac", sa.String(length=16), nullable=True),
        sa.Column("quantity", sa.Numeric(12, 2), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(18, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_invoice_items"),
        sa.ForeignKeyConstraint(
            ["invoice_id"], ["invoices.id"],
            name="fk_invoice_items_invoice_id_invoices", ondelete="CASCADE",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_invoice_items_invoice_id", "invoice_items", ["invoice_id"])

    op.create_table(
        "invoice_status_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False, comment="surrogate key"),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.String(length=24), nullable=True),
        sa.Column("to_status", sa.String(length=24), nullable=False),
        sa.Column("changed_by_id", sa.Integer(), nullable=True),
        sa.Column("changed_by_label", sa.String(length=120), nullable=True),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_invoice_status_history"),
        sa.ForeignKeyConstraint(
            ["invoice_id"], ["invoices.id"],
            name="fk_invoice_status_history_invoice_id_invoices", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by_id"], ["users.id"],
            name="fk_invoice_status_history_changed_by_id_users", ondelete="SET NULL",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_invoice_status_history_invoice_id", "invoice_status_history", ["invoice_id"])

    # Ledger link: which invoice a collection settles (nullable, additive).
    if is_sqlite:
        with op.batch_alter_table("payments") as batch_op:
            batch_op.add_column(sa.Column("invoice_id", sa.Integer(), nullable=True))
            batch_op.create_index("ix_payments_invoice_id", ["invoice_id"])
            batch_op.create_foreign_key(
                "fk_payments_invoice_id_invoices", "invoices", ["invoice_id"], ["id"],
                ondelete="SET NULL",
            )
    else:
        op.add_column("payments", sa.Column("invoice_id", sa.Integer(), nullable=True))
        op.create_index("ix_payments_invoice_id", "payments", ["invoice_id"])
        op.create_foreign_key(
            "fk_payments_invoice_id_invoices", "payments", "invoices",
            ["invoice_id"], ["id"], ondelete="SET NULL",
        )

    # CHECK constraints: MySQL enforces them; SQLite parses and ignores them.
    if not is_sqlite:
        op.create_check_constraint("invoice_total_non_negative", "invoices", "total_amount >= 0")
        op.create_check_constraint("invoice_paid_non_negative", "invoices", "amount_paid >= 0")
        op.create_check_constraint("invoice_qty_positive", "invoice_items", "quantity > 0")
        op.create_check_constraint("invoice_price_non_negative", "invoice_items", "unit_price >= 0")


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    if is_sqlite:
        # SQLite cannot drop a column/FK without a table rebuild; dropping the
        # whole billing surface is the downgrade path for disposable dev DBs.
        op.drop_table("invoice_status_history")
        op.drop_table("invoice_items")
        op.drop_table("invoices")
        return

    op.drop_constraint("fk_payments_invoice_id_invoices", "payments", type_="foreignkey")
    op.drop_index("ix_payments_invoice_id", table_name="payments")
    op.drop_column("payments", "invoice_id")

    # op.f() marks the names as already convention-expanded; without it
    # alembic re-applies ck_<table>_<name> and MySQL fails with errno 3821.
    op.drop_constraint(op.f("ck_invoice_items_invoice_qty_positive"), "invoice_items", type_="check")
    op.drop_constraint(op.f("ck_invoice_items_invoice_price_non_negative"), "invoice_items", type_="check")
    op.drop_constraint(op.f("ck_invoices_invoice_paid_non_negative"), "invoices", type_="check")
    op.drop_constraint(op.f("ck_invoices_invoice_total_non_negative"), "invoices", type_="check")

    op.drop_table("invoice_status_history")
    op.drop_table("invoice_items")
    op.drop_table("invoices")
