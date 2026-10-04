"""Authentication security tests: enumeration, lockout, token rotation, logout."""

from __future__ import annotations

from datetime import timedelta

from app.core.security import digest_token
from app.db.base import utcnow
from app.repositories.user_repository import AuthTokenRepository
from tests.conftest import ROLE_CREDENTIALS, login


def test_login_success_returns_tokens_and_identity(client):
    response = login(client, "ADMIN")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["user"]["role"] == "ADMIN"
    assert data["tokens"]["access_token"] and data["tokens"]["refresh_token"]
    assert data["tokens"]["expires_in"] > 0
    # No credential material may be echoed back (note: the flag
    # ``must_change_password`` legitimately contains the word "password").
    body = response.text.lower()
    assert '"password":' not in body and "password_hash" not in body and "bcrypt" not in body


def test_login_failure_is_generic_for_unknown_and_wrong_password(client):
    unknown = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.demo", "password": "Wrong@12345"},
    )
    wrong_password = client.post(
        "/api/v1/auth/login",
        json={"email": ROLE_CREDENTIALS["ADMIN"], "password": "Wrong@12345"},
    )
    assert unknown.status_code == wrong_password.status_code == 401
    # Identical messages prevent user enumeration.
    assert unknown.json()["error"]["message"] == wrong_password.json()["error"]["message"]


def test_failed_logins_lock_the_account(client, super_admin_headers):
    # Use a purpose-built account so the lockout does not break other tests.
    created = client.post(
        "/api/v1/users",
        json={
            "name": "Lockout Probe",
            "email": "lockout.probe@nmtsolution.demo",
            "role": "SALES_AGENT",
            "temporary_password": "Probe@12345",
        },
        headers=super_admin_headers,
    )
    if created.status_code == 409:  # already created by an earlier run
        pass
    user_id = created.json()["data"]["id"] if created.status_code == 201 else None

    locked = False
    for _ in range(8):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "lockout.probe@nmtsolution.demo", "password": "Wrong@12345"},
        )
        if response.status_code == 423:
            locked = True
            break
    assert locked, "account should lock after repeated failures"

    if user_id:
        unlocked = client.post(f"/api/v1/users/{user_id}/unlock", headers=super_admin_headers)
        assert unlocked.status_code == 200


def test_refresh_token_rotates_and_reuse_is_detected(client):
    tokens = login(client, "ACCOUNTS").json()["data"]["tokens"]
    first_refresh = tokens["refresh_token"]

    rotated = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert rotated.status_code == 200
    new_refresh = rotated.json()["data"]["tokens"]["refresh_token"]
    assert new_refresh != first_refresh

    # Replaying the rotated token must fail and revoke the family.
    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert replay.status_code == 401
    after_replay = client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert after_replay.status_code == 401, "reuse detection must kill the whole family"


def test_logout_revokes_refresh_token(client):
    tokens = login(client, "MANAGEMENT").json()["data"]["tokens"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]},
                       headers=headers).status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_expired_refresh_token_is_rejected(client, session):
    tokens = login(client, "ADMIN").json()["data"]["tokens"]
    # Force-expire the stored token, as if 7 days had passed.
    stored = AuthTokenRepository(session).get_by_digest(digest_token(tokens["refresh_token"]))
    stored.expires_at = utcnow() - timedelta(minutes=1)
    session.commit()  # the API runs in its own transaction
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_protected_endpoint_requires_token(client):
    response = client.get("/api/v1/bookings")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_failed"


def test_malformed_and_tampered_tokens_are_rejected(client):
    base = login(client, "ADMIN").json()["data"]["tokens"]["access_token"]
    for bad in ("not-a-jwt", base[:-3] + "abc", "", "Bearer"):
        response = client.get("/api/v1/bookings", headers={"Authorization": f"Bearer {bad}"})
        assert response.status_code == 401


def test_password_change_requires_current_password_and_revokes_sessions(client, unique_email, super_admin_headers):
    created = client.post(
        "/api/v1/users",
        json={"name": "Password Probe", "email": unique_email, "role": "SALES_AGENT",
              "temporary_password": "Initial@12345"},
        headers=super_admin_headers,
    )
    assert created.status_code == 201

    tokens = client.post(
        "/api/v1/auth/login", json={"email": unique_email, "password": "Initial@12345"}
    ).json()["data"]["tokens"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    wrong = client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "NotTheOne@1", "new_password": "Changed@12345",
              "confirm_password": "Changed@12345"},
        headers=headers,
    )
    assert wrong.status_code == 401

    changed = client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "Initial@12345", "new_password": "Changed@12345",
              "confirm_password": "Changed@12345"},
        headers=headers,
    )
    assert changed.status_code == 200
    # Existing refresh tokens must be dead after a password change.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_weak_passwords_are_rejected(client, unique_email):
    for weak in ("password", "short1!", "alllowercase1!", "ALLUPPERCASE1!", "NoDigits!!", "NoSymbols12"):
        response = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Weak Probe",
                "email": unique_email,
                "password": weak,
                "confirm_password": weak,
                "role": "SALES_AGENT",
                "consent": True,
            },
        )
        assert response.status_code == 422, f"{weak} should be rejected"


def test_self_registration_cannot_create_privileged_roles(client, unique_email):
    for role in ("SUPER_ADMIN", "ADMIN", "ACCOUNTS"):
        response = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Escalation Attempt",
                "email": unique_email,
                "password": "Strong@12345",
                "confirm_password": "Strong@12345",
                "role": role,
                "consent": True,
            },
        )
        assert response.status_code == 422, f"self-registration must not mint {role}"


def test_registration_requires_consent_and_unique_email(client, unique_email):
    body = {
        "name": "Consent Probe",
        "email": unique_email,
        "password": "Strong@12345",
        "confirm_password": "Strong@12345",
        "role": "CUSTOMER",
        "consent": False,
    }
    assert client.post("/api/v1/auth/register", json=body).status_code in (400, 422)
    body["consent"] = True
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    assert client.post("/api/v1/auth/register", json=body).status_code == 409


def test_me_endpoint_exposes_permissions_not_secrets(client, admin_headers):
    response = client.get("/api/v1/auth/me", headers=admin_headers)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "booking:approve" in payload["user"]["permissions"]
    assert "password_hash" not in response.text and "\"password\":" not in response.text
    assert "secret" not in response.text.lower()
