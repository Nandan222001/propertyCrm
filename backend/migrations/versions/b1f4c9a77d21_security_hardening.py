"""Security hardening: integrity checks and query-shape indexes.

Adds defence-in-depth constraints that the ORM alone cannot guarantee when data
is written by migrations, batch imports or a DBA:

* CHECK constraints block negative money and invalid geometry at the storage
  layer (MySQL 8.0.16+ enforces CHECK; older versions parse and ignore them, so
  the application-level validation remains authoritative);
* composite indexes support the hot paths (audit search, lockout counters,
  overdue sweeps, notification queues) and keep them off sequential scans.

Revision ID: b1f4c9a77d21
Revises: 23234ec09842
"""

from __future__ import annotations

from alembic import op

revision = "b1f4c9a77d21"
down_revision = "23234ec09842"
branch_labels = None
depends_on = None

#: (table, short constraint name, SQL expression). Alembic expands the short
#: name through the metadata naming convention (``ck_<table>_<name>``).
CHECK_CONSTRAINTS = [
    ("bookings", "final_price_non_negative", "final_price >= 0"),
    ("bookings", "paid_amount_non_negative", "paid_amount >= 0"),
    ("payments", "amount_positive", "amount > 0"),
    ("commissions", "net_amount_non_negative", "net_amount >= 0"),
    ("plots", "area_positive", "area_sqft > 0"),
    ("plots", "price_non_negative", "price >= 0"),
]

#: (index name, table, columns)
INDEXES = [
    ("ix_audit_logs_actor_occurred", "audit_logs", ["actor_id", "occurred_at"]),
    ("ix_audit_logs_action_occurred", "audit_logs", ["action", "occurred_at"]),
    ("ix_login_attempts_email_occurred", "login_attempts", ["email_hash", "occurred_at"]),
    ("ix_login_attempts_ip_occurred", "login_attempts", ["ip_address", "occurred_at"]),
    ("ix_security_events_event_created", "security_events", ["event", "created_at"]),
    ("ix_bookings_status_date", "bookings", ["status", "booking_date"]),
    ("ix_payments_status_due", "payments", ["status", "due_date"]),
    ("ix_notifications_read_created", "notifications", ["is_read", "created_at"]),
    ("ix_auth_tokens_user_purpose", "auth_tokens", ["user_id", "purpose"]),
    ("ix_customers_status_agent", "customers", ["status", "agent_id"]),
]


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # SQLite cannot attach CHECK constraints to an existing table without a full
    # table rebuild; the ORM/validators enforce the same rules there.
    if not is_sqlite:
        for table, short_name, condition in CHECK_CONSTRAINTS:
            op.create_check_constraint(short_name, table, condition)

    for name, table, columns in INDEXES:
        op.create_index(name, table, columns, unique=False)


def downgrade() -> None:
    for name, table, _columns in reversed(INDEXES):
        op.drop_index(name, table_name=table)
    if op.get_bind().dialect.name != "sqlite":
        for table, short_name, _condition in reversed(CHECK_CONSTRAINTS):
            op.drop_constraint(f"ck_{table}_{short_name}", table, type_="check")
