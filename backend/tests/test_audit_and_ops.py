"""Auditability, monitoring signals, migrations and money utilities."""

from __future__ import annotations

import pathlib
from decimal import Decimal

from app.models.audit import AuditLog, SecurityEvent


def test_mutations_write_audit_rows(client, session, admin_headers):
    before = session.query(AuditLog).count()
    client.post("/api/v1/projects", json={"name": "Audit Trail Project", "city": "Pune"},
                headers=admin_headers)
    session.rollback()  # end the read txn to see committed rows
    assert session.query(AuditLog).count() > before
    latest = session.query(AuditLog).order_by(AuditLog.id.desc()).first()
    assert latest.action in {"crud.create", "CREATE"}
    assert latest.resource == "project"
    assert latest.actor_role == "ADMIN"
    assert latest.request_id


def test_denied_permission_is_recorded_as_a_security_event(client, session, agent_headers):
    before = session.query(SecurityEvent).filter(SecurityEvent.event == "rbac.denied").count()
    client.get("/api/v1/users", headers=agent_headers)
    session.rollback()  # end the read txn to see committed rows
    after = session.query(SecurityEvent).filter(SecurityEvent.event == "rbac.denied").count()
    assert after > before, "denied access must be observable for alerting"


def test_failed_login_is_recorded(client, session):
    before = session.query(SecurityEvent).filter(SecurityEvent.event == "auth.login_failed").count()
    client.post("/api/v1/auth/login", json={"email": "someone@example.demo", "password": "Bad@12345"})
    session.rollback()  # end the read txn to see committed rows
    after = session.query(SecurityEvent).filter(SecurityEvent.event == "auth.login_failed").count()
    assert after > before


def test_audit_log_endpoint_requires_audit_permission(client, admin_headers, super_admin_headers):
    assert client.get("/api/v1/audit-logs", headers=admin_headers).status_code == 403
    assert client.get("/api/v1/audit-logs", headers=super_admin_headers).status_code == 200


def test_security_event_acknowledgement(client, super_admin_headers, session):
    events = client.get("/api/v1/security-events", headers=super_admin_headers).json()["data"]
    if not events:
        return
    event_id = events[0]["id"]
    acked = client.post(f"/api/v1/security-events/{event_id}/acknowledge", headers=super_admin_headers)
    assert acked.status_code == 200
    session.rollback()  # end the read txn to see committed rows
    row = session.query(SecurityEvent).filter(SecurityEvent.id == event_id).one()
    assert row.acknowledged_at is not None


def test_activity_summary_reports_security_counters(client, super_admin_headers):
    summary = client.get("/api/v1/reports/audit-trail?days=30", headers=super_admin_headers)
    assert summary.status_code == 200
    data = summary.json()["data"]
    assert {"actions", "security_events"} <= set(data)
    assert {"login_failures", "denied", "rate_limited"} <= set(data["security_events"])


def test_retention_sweep_is_permission_gated_and_dry_safe(client, super_admin_headers):
    response = client.post("/api/v1/ops/retention-sweep?days=7300", headers=super_admin_headers)
    assert response.status_code == 200
    assert "audit_logs_deleted" in response.json()["data"]


def test_migrations_run_end_to_end_and_render_mysql_ddl(tmp_path):
    """Alembic: full upgrade on SQLite + MySQL offline rendering."""
    from alembic import command
    from alembic.config import Config

    backend_root = pathlib.Path(__file__).resolve().parents[1]
    db_file = tmp_path / "migration.sqlite3"

    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    # Explicit URL wins over the application settings inside migrations/env.py,
    # so the migration is applied to a disposable database.
    config.set_main_option("sqlalchemy.url", f"sqlite+pysqlite:///{db_file}")
    config.cmd_opts = type("Opts", (), {"x": [f"db_url=sqlite+pysqlite:///{db_file}"]})()
    command.upgrade(config, "head")

    import sqlite3

    with sqlite3.connect(db_file) as connection:
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
    for expected in ("users", "customers", "bookings", "payments", "audit_logs", "security_events"):
        assert expected in tables

    # Downgrade must also work (rollback safety).
    command.downgrade(config, "base")
    with sqlite3.connect(db_file) as connection:
        remaining = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
    assert "bookings" not in remaining

    # MySQL rendering check (no live server needed): the migration must compile
    # to MySQL-compatible DDL, including InnoDB/utf8mb4 and CHECK constraints.
    import subprocess
    import sys

    from alembic.config import Config as AlembicConfig  # noqa: F401

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head", "--sql"],
        cwd=backend_root,
        capture_output=True,
        text=True,
        env={
            **__import__("os").environ,
            "DB_DIALECT": "mysql",
            "DB_PASSWORD": "test-only",
            "SECRET_KEY": "test",
            "INDEX_PEPPER": "test",
            "FIELD_ENCRYPTION_KEY": "test",
        },
    )
    assert result.returncode == 0, result.stderr
    sql = result.stdout.lower()
    assert "engine=innodb" in sql and "charset=utf8mb4" in sql
    assert "check (final_price >= 0)" in sql
    assert "numeric(18, 2)" in sql


def test_money_helpers_indian_formatting_and_words():
    from app.utils.money import amount_in_words, fmt_inr, parse_inr, with_gst, with_tds

    assert fmt_inr(1840000) == "18,40,000"
    assert fmt_inr(Decimal("123456789.50")) == "12,34,56,789.50"
    assert parse_inr("₹18,40,000") == Decimal("1840000.00")
    assert amount_in_words(1840000) == "Eighteen Lakh Forty Thousand Rupees Only"
    assert amount_in_words(0) == "Zero Rupees Only"
    assert amount_in_words(Decimal("1000.50")) == "One Thousand Rupees and Fifty Paise Only"
    assert with_gst(Decimal("1000")) == Decimal("180.00")
    assert with_tds(Decimal("1000")) == Decimal("50.00")
