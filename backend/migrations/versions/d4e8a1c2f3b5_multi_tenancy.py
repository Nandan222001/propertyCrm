"""Multi-tenancy: tenants table + tenant_id on every business table.

* creates ``tenants`` and one *default tenant* (slug ``lalita``) that adopts all
  existing data, so a running single-company installation keeps working;
* adds ``tenant_id`` (FK, indexed) to every business table — NOT NULL for
  business data, nullable for users / audit / settings / notifications where NULL
  means "platform-level";
* existing SUPER_ADMIN accounts become platform accounts (``tenant_id`` NULL);
* turns the globally-unique business numbers (booking / invoice / receipt number,
  agent code, project name, setting key) into per-tenant uniques so two tenants
  can each have ``BK-2026-0001`` or a project called "Green Meadows".

Revision ID: d4e8a1c2f3b5
Revises: c7d31f0a4b6e
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d4e8a1c2f3b5"
down_revision = "c7d31f0a4b6e"
branch_labels = None
depends_on = None

DEFAULT_TENANT_SLUG = "default"
DEFAULT_TENANT_NAME = "Default organisation"

#: Business data: every row must belong to a tenant.
REQUIRED = (
    "customers", "projects", "plots", "documents", "bookings", "payments",
    "receipts", "agents", "commissions", "invoices", "data_subject_requests",
)
#: NULL tenant_id = platform-level (super admin accounts, platform audit, …).
OPTIONAL = ("users", "audit_logs", "security_events", "app_settings", "notifications")

#: (table, old unique index name, column) — the index stays, but loses UNIQUE.
UNIQUE_INDEXES = (
    ("agents", "ix_agents_code", "code"),
    ("app_settings", "ix_app_settings_key", "key"),
    ("bookings", "ix_bookings_booking_number", "booking_number"),
    ("receipts", "ix_receipts_receipt_number", "receipt_number"),
    ("invoices", "ix_invoices_invoice_number", "invoice_number"),
)
#: (table, old UNIQUE constraint) dropped in favour of the composite below.
OLD_CONSTRAINTS = (
    ("projects", "uq_projects_name"),
    ("receipts", "uq_receipts_receipt_number"),
    ("invoices", "uq_invoices_invoice_number"),
)
#: (table, composite constraint name, columns)
COMPOSITES = (
    ("projects", "uq_projects_tenant_name", ["tenant_id", "name"]),
    ("agents", "uq_agents_tenant_code", ["tenant_id", "code"]),
    ("app_settings", "uq_app_settings_tenant_key", ["tenant_id", "key"]),
    ("bookings", "uq_bookings_tenant_booking_number", ["tenant_id", "booking_number"]),
    ("receipts", "uq_receipts_tenant_receipt_number", ["tenant_id", "receipt_number"]),
    ("invoices", "uq_invoices_tenant_invoice_number", ["tenant_id", "invoice_number"]),
)

DEFAULT_TENANT_ID = f"(SELECT id FROM tenants WHERE slug = '{DEFAULT_TENANT_SLUG}')"


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False, comment="surrogate key"),
        sa.Column("public_id", sa.String(length=32), nullable=False, comment="business reference"),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=48), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("plan", sa.String(length=16), nullable=False),
        sa.Column("max_users", sa.Integer(), nullable=False),
        sa.Column("contact_name", sa.String(length=120), nullable=True),
        sa.Column("contact_email", sa.String(length=190), nullable=True),
        sa.Column("contact_phone", sa.String(length=20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("suspended_at", sa.DateTime(), nullable=True),
        sa.Column("suspended_reason", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_tenants"),
        sa.UniqueConstraint("public_id", name="uq_tenants_public_id"),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
        mysql_engine="InnoDB", mysql_charset="utf8mb4", mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_tenants_public_id", "tenants", ["public_id"], unique=True)
    op.create_index("ix_tenants_slug", "tenants", ["slug"], unique=True)
    op.create_index("ix_tenants_status", "tenants", ["status"])

    # Rows that pre-date multi-tenancy are adopted by a default tenant. A database with no such rows
    # (a fresh install) gets no tenant at all: organisations are created by the platform owner.
    legacy = " OR ".join(f"EXISTS (SELECT 1 FROM {table})" for table in REQUIRED)
    legacy += " OR EXISTS (SELECT 1 FROM users WHERE role <> 'SUPER_ADMIN')"
    op.execute(
        sa.text(
            "INSERT INTO tenants (public_id, name, slug, status, plan, max_users) "
            f"SELECT 'TEN-DEFAULT0001', '{DEFAULT_TENANT_NAME}', '{DEFAULT_TENANT_SLUG}', 'ACTIVE', 'ENTERPRISE', 1000 "
            f"FROM (SELECT 1 AS one) AS marker WHERE {legacy}"
        )
    )

    # 1) add the column (nullable), index and FK
    for table in (*REQUIRED, *OPTIONAL):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("tenant_id", sa.Integer(), nullable=True, comment="owning tenant"))
            batch.create_index(f"ix_{table}_tenant_id", ["tenant_id"])
            batch.create_foreign_key(
                f"fk_{table}_tenant_id_tenants", "tenants", ["tenant_id"], ["id"], ondelete="RESTRICT"
            )

    # 2) backfill: everything belongs to the default tenant, except platform admins
    for table in (*REQUIRED, *OPTIONAL):
        if table == "users":
            op.execute(sa.text(
                f"UPDATE users SET tenant_id = {DEFAULT_TENANT_ID} WHERE role <> 'SUPER_ADMIN'"
            ))
        else:
            op.execute(sa.text(f"UPDATE {table} SET tenant_id = {DEFAULT_TENANT_ID}"))

    # 3) business tables become NOT NULL
    for table in REQUIRED:
        with op.batch_alter_table(table) as batch:
            batch.alter_column("tenant_id", existing_type=sa.Integer(), nullable=False)

    # 4) per-tenant uniqueness
    for table, name in OLD_CONSTRAINTS:
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(name, type_="unique")
    for table, index, column in UNIQUE_INDEXES:
        with op.batch_alter_table(table) as batch:
            batch.drop_index(index)
            batch.create_index(index, [column], unique=False)
    for table, name, columns in COMPOSITES:
        with op.batch_alter_table(table) as batch:
            batch.create_unique_constraint(name, columns)


def downgrade() -> None:
    for table, name, _columns in COMPOSITES:
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(name, type_="unique")
    for table, index, column in UNIQUE_INDEXES:
        with op.batch_alter_table(table) as batch:
            batch.drop_index(index)
            batch.create_index(index, [column], unique=True)
    for table, name in OLD_CONSTRAINTS:
        column = {"projects": "name", "receipts": "receipt_number", "invoices": "invoice_number"}[table]
        with op.batch_alter_table(table) as batch:
            batch.create_unique_constraint(name, [column])

    for table in (*REQUIRED, *OPTIONAL):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(f"fk_{table}_tenant_id_tenants", type_="foreignkey")
            batch.drop_index(f"ix_{table}_tenant_id")
            batch.drop_column("tenant_id")

    op.drop_index("ix_tenants_status", table_name="tenants")
    op.drop_index("ix_tenants_slug", table_name="tenants")
    op.drop_index("ix_tenants_public_id", table_name="tenants")
    op.drop_table("tenants")
