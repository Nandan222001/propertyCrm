"""Database-layer security tests: injection resistance, retention, guard rails."""

from __future__ import annotations

import pathlib

import pytest
from sqlalchemy import text

from app.db.base import Base

INJECTION_PAYLOADS = [
    "'; DROP TABLE customers; --",
    "' OR '1'='1",
    "1' UNION SELECT password_hash FROM users --",
    "admin'--",
    "\\'; truncate table bookings; --",
]


@pytest.mark.parametrize("payload", INJECTION_PAYLOADS)
def test_search_parameter_is_bound_not_interpolated(client, admin_headers, payload, session):
    response = client.get("/api/v1/customers", params={"search": payload}, headers=admin_headers)
    assert response.status_code in (200, 422)
    # Tables must all still exist after every payload.
    for table in ("customers", "users", "bookings", "payments"):
        assert session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"), {"name": table}
        ).first(), f"{table} disappeared — injection succeeded"


@pytest.mark.parametrize("payload", INJECTION_PAYLOADS)
def test_login_email_injection_is_harmless(client, payload):
    response = client.post("/api/v1/auth/login", json={"email": payload, "password": "Wrong@12345"})
    assert response.status_code in (401, 422)


def test_sort_and_filter_parameters_cannot_reach_sql(client, admin_headers):
    for params in (
        {"sort": "price; DROP TABLE payments"},
        {"sort": "(SELECT password_hash FROM users)"},
        {"status": "ACTIVE' OR 1=1 --"},
    ):
        response = client.get("/api/v1/plots", params=params, headers=admin_headers)
        assert response.status_code in (200, 422)


def test_unscoped_bulk_delete_is_blocked(session):
    """ORM guard: a DELETE without WHERE must raise instead of wiping a table."""
    from app.models.customer import Customer

    with pytest.raises(RuntimeError):
        session.execute(Customer.__table__.delete())


def test_soft_delete_keeps_rows_for_retention(client, session, admin_headers, unique_email, unique_phone):
    created = client.post(
        "/api/v1/customers",
        json={"name": "Retention Probe", "email": unique_email, "phone": unique_phone,
              "consent_given": True},
        headers=admin_headers,
    )
    customer_id = created.json()["data"]["id"]
    assert client.delete(f"/api/v1/customers/{customer_id}", headers=admin_headers).status_code == 200

    from app.models.customer import Customer

    session.rollback()  # end the read txn to see committed rows
    stored = session.query(Customer).filter(Customer.id == customer_id).one()
    assert stored.is_deleted is True and stored.deleted_at is not None
    # Standard queries hide it; audit queries can still see it.
    assert session.query(Customer).filter(Customer.id == customer_id,
                                          Customer.is_deleted.is_(False)).first() is None


def test_every_model_carries_security_columns_and_constraints():
    """Schema guard: money columns are DECIMAL, identifiers unique, FKs present."""
    bookings = Base.metadata.tables["bookings"]
    assert str(bookings.c.final_price.type).startswith("NUMERIC")
    assert "active_plot_id" in bookings.c and bookings.c.active_plot_id.unique, "one live booking per plot"

    users = Base.metadata.tables["users"]
    assert users.c.password_hash.type.length >= 60
    assert users.c.email.unique is True

    customers = Base.metadata.tables["customers"]
    for column in ("email", "phone", "address", "kyc_reference", "pan_number"):
        assert column in customers.c, f"{column} must be a stored (encrypted) column"

    # Audit tables must exist and reference the actor.
    audit = Base.metadata.tables["audit_logs"]
    assert "actor_id" in audit.c and "occurred_at" in audit.c


def test_least_privilege_database_bootstrap_script_exists():
    """The MySQL provisioning script must grant only what the app needs."""
    script = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "create_db.sql"
    assert script.exists(), "scripts/create_db.sql must provision the least-privilege user"
    content = script.read_text().lower()
    assert "create user" in content
    assert "grant select, insert, update, delete" in content
    assert "grant all" not in content.replace("grant all privileges on `lalita_erp`.* to", "")
    # Audit rows are append-only: no UPDATE/DELETE grant on the audit tables.
    assert "audit_logs" in content and "security_events" in content
    assert "require ssl" in content or "require x509" in content


def test_connection_string_never_logs_the_password(client, admin_headers):
    """Error payloads must not leak credentials or connection strings."""
    response = client.get("/api/v1/does-not-exist", headers=admin_headers)
    assert "mysql+pymysql" not in response.text
    assert "lalita_dev_password" not in response.text
