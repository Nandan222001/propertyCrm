"""Pytest fixtures.

Environment is configured **before** importing the app so the cached settings
singleton points at an isolated SQLite file (the MySQL DDL is verified separately
by ``test_migrations.py``, which renders the MySQL dialect offline).
"""

from __future__ import annotations

import os
import random
import tempfile
import uuid
from pathlib import Path

import pytest

# --------------------------------------------------------------------- env
TMP_DIR = Path(tempfile.mkdtemp(prefix="lalita-tests-"))
DB_PATH = TMP_DIR / "test.sqlite3"
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DEBUG": "false",
        "DB_DIALECT": "sqlite",
        "SQLITE_PATH": str(DB_PATH),
        "SECRET_KEY": "unit-test-secret-key-please-change-0123456789",
        "INDEX_PEPPER": "unit-test-pepper",
        "FIELD_ENCRYPTION_KEY": "unit-test-field-key",
        "RATE_LIMIT_ENABLED": "false",
        "LOG_JSON": "true",
        "AUDIT_LOG_ENABLED": "true",
        "PII_MASK_BY_DEFAULT": "true",
        "SEED_DEMO_PASSWORD": "Demo@12345",
        "RESEND_API_KEY": "",  # never send real mail from tests
        "SMTP_HOST": "",
    }
)

from fastapi.testclient import TestClient  # noqa: E402  (must follow env setup)

from app.core.config import settings  # noqa: E402
from app.db.init_db import bootstrap_database  # noqa: E402
from app.db.session import dispose_engine, session_scope  # noqa: E402
from app.main import create_app  # noqa: E402

DEMO_PASSWORD = "Demo@12345"

ROLE_CREDENTIALS = {
    "SUPER_ADMIN": "superadmin@nmtsolution.demo",
    "ADMIN": "admin@nmtsolution.demo",
    "SALES_MANAGER": "manager@nmtsolution.demo",
    "SALES_AGENT": "agent@nmtsolution.demo",
    "ACCOUNTS": "accounts@nmtsolution.demo",
    "CUSTOMER": "customer@nmtsolution.demo",
}


@pytest.fixture(scope="session", autouse=True)
def _database() -> None:
    """Create the schema and load the test fixture dataset once per session."""
    assert settings.DB_DIALECT == "sqlite", "tests must never touch the MySQL database"
    bootstrap_database()
    from app.db.session import session_scope
    from tests.support.seed import seed_all

    with session_scope() as session:
        seed_all(session)
    yield
    dispose_engine()


@pytest.fixture(scope="session")
def app(_database):
    return create_app()


@pytest.fixture()
def client(app) -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def session(_database):
    """Direct DB session for assertions about stored (encrypted) values."""
    with session_scope() as db:
        yield db


# ------------------------------------------------------------------ helpers
def login(client: TestClient, role: str = "ADMIN", password: str = DEMO_PASSWORD) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ROLE_CREDENTIALS[role], "password": password},
        headers={"user-agent": f"pytest/{role}"},
    )
    return response


def auth_headers(client: TestClient, role: str = "ADMIN") -> dict[str, str]:
    response = login(client, role)
    assert response.status_code == 200, f"{role} login failed: {response.text}"
    token = response.json()["data"]["tokens"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers(client) -> dict[str, str]:
    return auth_headers(client, "ADMIN")


@pytest.fixture()
def agent_headers(client) -> dict[str, str]:
    return auth_headers(client, "SALES_AGENT")


@pytest.fixture()
def accounts_headers(client) -> dict[str, str]:
    return auth_headers(client, "ACCOUNTS")


@pytest.fixture()
def customer_headers(client) -> dict[str, str]:
    return auth_headers(client, "CUSTOMER")


@pytest.fixture()
def super_admin_headers(client) -> dict[str, str]:
    return auth_headers(client, "SUPER_ADMIN")


@pytest.fixture()
def unique_email() -> str:
    return f"user-{uuid.uuid4().hex[:8]}@example.demo"


def starting_password(name: str, phone: str) -> str:
    """What the server sets for an account someone else created (first 4 letters + last 5 digits)."""
    from app.core.passwords import initial_password

    return initial_password(name, phone)


@pytest.fixture()
def unique_phone() -> str:
    """A valid, unique 10-digit Indian mobile number (first digit 6-9)."""
    return f"{random.choice('6789')}{random.randint(0, 999_999_999):09d}"
