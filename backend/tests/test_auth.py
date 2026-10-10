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


def test_failed_logins_lock_the_account(client, admin_headers):
    # Use a purpose-built account so the lockout does not break other tests.
    created = client.post(
        "/api/v1/users",
        json={
            "name": "Lockout Probe",
            "email": "lockout.probe@nmtsolution.demo",
            "role": "SALES_AGENT",
            "temporary_password": "Probe@12345",
        },
        headers=admin_headers,
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
        unlocked = client.post(f"/api/v1/users/{user_id}/unlock", headers=admin_headers)
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


def test_password_change_requires_current_password_and_revokes_sessions(client, unique_email, admin_headers):
    created = client.post(
        "/api/v1/users",
        json={"name": "Password Probe", "email": unique_email, "role": "SALES_AGENT",
              "temporary_password": "Initial@12345"},
        headers=admin_headers,
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
        "tenant": "lalita",
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


def test_self_registered_account_waits_for_administrator_activation(client, admin_headers, unique_email):
    body = {"name": "Walk In", "email": unique_email, "password": "Strong@12345",
            "confirm_password": "Strong@12345", "role": "SALES_AGENT", "consent": True, "tenant": "lalita"}
    created = client.post("/api/v1/auth/register", json=body)
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    assert data["tokens"] is None and data["pending_activation"] is True
    assert data["user"]["status"] == "PENDING"

    # cannot sign in yet
    attempt = client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Strong@12345"})
    assert attempt.status_code in (401, 403)
    assert "activate" in attempt.text.lower()

    # that organisation's admin is told, and only an admin can activate
    queue = client.get("/api/v1/notifications", headers=admin_headers).json()["data"]
    assert any("awaiting activation" in n["title"].lower() for n in queue)
    activated = client.patch(f"/api/v1/users/{data['user']['id']}", headers=admin_headers, json={"status": "ACTIVE"})
    assert activated.status_code == 200, activated.text
    ok = client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Strong@12345"})
    assert ok.status_code == 200, ok.text


def test_invited_user_can_keep_their_session_and_activates_by_choosing_a_password(client, admin_headers, unique_email):
    """Admin-created users sign in with a temporary password: refresh must work, and changing it activates them."""
    temp = "Temp#Pass2026"
    created = client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Invited Person", "email": unique_email, "role": "ACCOUNTS", "temporary_password": temp,
    })
    assert created.status_code in (200, 201), created.text
    assert created.json()["data"]["status"] == "INVITED"
    login = client.post("/api/v1/auth/login", json={"email": unique_email, "password": temp})
    assert login.status_code == 200, login.text
    tokens = login.json()["data"]["tokens"]
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200, refreshed.text

    headers = {"Authorization": f"Bearer {refreshed.json()['data']['tokens']['access_token']}"}
    changed = client.post("/api/v1/auth/password/change", headers=headers, json={
        "current_password": temp, "new_password": "Brand#New2026x", "confirm_password": "Brand#New2026x",
    })
    assert changed.status_code == 200, changed.text
    again = client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Brand#New2026x"})
    assert again.status_code == 200
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {again.json()['data']['tokens']['access_token']}"})
    assert me.json()["data"]["user"]["status"] == "ACTIVE"


def test_password_reset_email_is_sent_and_link_works(client, admin_headers, unique_email, monkeypatch):
    from app.services import mailer

    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr("app.controllers.auth_controller.send_mail", lambda to, subject, body: sent.append((to, subject, body)))
    client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Forgetful", "email": unique_email, "role": "ACCOUNTS", "temporary_password": "Temp#Pass2026",
    })
    # activate by choosing a password first (invited -> active)
    login = client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Temp#Pass2026"}).json()["data"]["tokens"]
    client.post("/api/v1/auth/password/change", headers={"Authorization": f"Bearer {login['access_token']}"},
                json={"current_password": "Temp#Pass2026", "new_password": "Original#Pass26", "confirm_password": "Original#Pass26"})

    response = client.post("/api/v1/auth/password/forgot", json={"email": unique_email})
    assert response.status_code == 200
    assert sent and sent[0][0] == unique_email
    token = sent[0][2].split("token=")[1].split()[0]
    assert token == response.json()["data"].get("debug_token")

    # unknown address: identical answer, nothing sent
    sent.clear()
    unknown = client.post("/api/v1/auth/password/forgot", json={"email": f"nobody-{unique_email}"})
    assert unknown.status_code == 200 and unknown.json()["message"] == response.json()["message"] and not sent

    reset = client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "Reset#Pass2026a"})
    assert reset.status_code == 200, reset.text
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Reset#Pass2026a"}).status_code == 200
    assert client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "Another#Pass2026b"}).status_code in (400, 401, 422)
    assert mailer.reset_link("abc").endswith("/reset-password?token=abc")
