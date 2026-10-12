"""Authentication security tests: enumeration, lockout, token rotation, logout."""

from __future__ import annotations

from datetime import timedelta

from app.core.security import digest_token
from app.db.base import utcnow
from app.repositories.user_repository import AuthTokenRepository
from tests.conftest import ROLE_CREDENTIALS, login, starting_password


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
            "phone": "9876500001",
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
    tokens = login(client, "ACCOUNTS").json()["data"]["tokens"]
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


def test_password_change_requires_current_password_and_revokes_sessions(client, unique_email, unique_phone, admin_headers):
    created = client.post(
        "/api/v1/users",
        json={"name": "Password Probe", "email": unique_email, "role": "SALES_AGENT", "phone": unique_phone},
        headers=admin_headers,
    )
    assert created.status_code == 201

    tokens = client.post(
        "/api/v1/auth/login", json={"email": unique_email, "password": starting_password("Password Probe", unique_phone)}
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
        json={"current_password": starting_password("Password Probe", unique_phone), "new_password": "Changed@12345",
              "confirm_password": "Changed@12345"},
        headers=headers,
    )
    assert changed.status_code == 200
    # Existing refresh tokens must be dead after a password change.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_weak_new_passwords_are_rejected(client, admin_headers, unique_email, unique_phone):
    client.post("/api/v1/users", headers=admin_headers,
                json={"name": "Weak Probe", "email": unique_email, "phone": unique_phone, "role": "SALES_AGENT"})
    tokens = client.post("/api/v1/auth/login", json={
        "email": unique_email, "password": starting_password("Weak Probe", unique_phone)}).json()["data"]["tokens"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    for weak in ("password", "short1!", "alllowercase1!", "ALLUPPERCASE1!", "NoDigits!!", "NoSymbols12"):
        response = client.post("/api/v1/auth/password/change", headers=headers, json={
            "current_password": starting_password("Weak Probe", unique_phone), "new_password": weak, "confirm_password": weak})
        assert response.status_code == 422, f"{weak} should be rejected"


def test_there_is_no_self_registration(client, unique_email):
    body = {"name": "Walk In", "email": unique_email, "password": "Strong@12345",
            "confirm_password": "Strong@12345", "role": "SALES_AGENT", "consent": True, "tenant": "lalita"}
    assert client.post("/api/v1/auth/register", json=body).status_code in (404, 405)


def test_me_endpoint_exposes_permissions_not_secrets(client, admin_headers):
    response = client.get("/api/v1/auth/me", headers=admin_headers)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "booking:approve" in payload["user"]["permissions"]
    assert "password_hash" not in response.text and "\"password\":" not in response.text
    assert "secret" not in response.text.lower()


def test_invited_user_can_keep_their_session_and_activates_by_choosing_a_password(client, admin_headers, unique_email, unique_phone):
    """Admin-created users sign in with the starting password: refresh must work, and changing it activates them."""
    temp = starting_password("Invited Person", unique_phone)
    created = client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Invited Person", "email": unique_email, "role": "ACCOUNTS", "phone": unique_phone,
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


def test_password_reset_email_is_sent_and_link_works(client, admin_headers, unique_email, unique_phone, monkeypatch):
    from app.services import mailer

    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr("app.controllers.auth_controller.send_mail", lambda to, subject, body: sent.append((to, subject, body)))
    client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Forgetful", "email": unique_email, "role": "ACCOUNTS", "phone": unique_phone,
    })
    temp = starting_password("Forgetful", unique_phone)
    # activate by choosing a password first (invited -> active)
    login = client.post("/api/v1/auth/login", json={"email": unique_email, "password": temp}).json()["data"]["tokens"]
    client.post("/api/v1/auth/password/change", headers={"Authorization": f"Bearer {login['access_token']}"},
                json={"current_password": temp, "new_password": "Original#Pass26", "confirm_password": "Original#Pass26"})

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


def test_starting_password_rule_and_it_is_never_returned(client, admin_headers, unique_email):
    from app.core.passwords import initial_password

    assert initial_password("Sanjay Patel", "98765 43210") == "sanj43210"
    assert initial_password("Om Rao", "+91 90000 12345") == "omra12345"
    created = client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Sanjay Patel", "email": unique_email, "role": "ACCOUNTS", "phone": "9876543210"})
    assert created.status_code == 201, created.text
    assert "sanj43210" not in created.text and "password" not in created.text.lower().replace("must_change_password", "")
    login = client.post("/api/v1/auth/login", json={"email": unique_email, "password": "sanj43210"})
    assert login.status_code == 200 and login.json()["data"]["user"]["must_change_password"] is True
    # a name with fewer than four letters, or a missing mobile, cannot get a starting password
    assert client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Al", "email": "al-" + unique_email, "role": "ACCOUNTS", "phone": "9876543210"}).status_code == 422
    assert client.post("/api/v1/users", headers=admin_headers, json={
        "name": "No Phone", "email": "np-" + unique_email, "role": "ACCOUNTS"}).status_code == 422


def test_admin_can_reset_a_users_password_to_the_starting_password(client, admin_headers, agent_headers, unique_email):
    created = client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Reset Probe", "email": unique_email, "role": "ACCOUNTS", "phone": "9876511111"})
    assert created.status_code == 201, created.text
    user_id = created.json()["data"]["id"]
    start = starting_password("Reset Probe", "9876511111")
    session = client.post("/api/v1/auth/login", json={"email": unique_email, "password": start}).json()["data"]["tokens"]
    headers = {"Authorization": f"Bearer {session['access_token']}"}
    changed = client.post("/api/v1/auth/password/change", headers=headers, json={
        "current_password": start, "new_password": "Mine#Secret2026", "confirm_password": "Mine#Secret2026"})
    assert changed.status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": start}).status_code == 401

    # only an admin may reset; nothing about the password comes back
    assert client.post(f"/api/v1/users/{user_id}/reset-password", headers=agent_headers).status_code == 403
    reset = client.post(f"/api/v1/users/{user_id}/reset-password", headers=admin_headers)
    assert reset.status_code == 200, reset.text
    assert start not in reset.text and "Mine#Secret2026" not in reset.text
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Mine#Secret2026"}).status_code == 401
    again = client.post("/api/v1/auth/login", json={"email": unique_email, "password": start})
    assert again.status_code == 200 and again.json()["data"]["user"]["must_change_password"] is True

    # an admin cannot reset their own password this way, nor a platform account
    me = client.get("/api/v1/auth/me", headers=admin_headers).json()["data"]["user"]
    assert client.post(f"/api/v1/users/{me['id']}/reset-password", headers=admin_headers).status_code in (400, 409, 422)


def test_forgot_password_reports_when_mail_is_not_configured_and_never_leaks_accounts(client, unique_email):
    known = client.post("/api/v1/auth/password/forgot", json={"email": "admin@nmtsolution.demo"}).json()
    unknown = client.post("/api/v1/auth/password/forgot", json={"email": unique_email}).json()
    assert known["message"] == unknown["message"]
    assert known["data"]["delivery"] == unknown["data"]["delivery"] == "unavailable"  # no SMTP_HOST in tests


def test_reset_mail_is_actually_sent_over_smtp(monkeypatch):
    from app.core.config import settings
    from app.services import mailer

    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            sent.append(("connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self, context=None):
            sent.append(("starttls",))

        def login(self, user, password):
            sent.append(("login", user))

        def send_message(self, message):
            sent.append(("message", message["To"], message["Subject"], message.get_content()))

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(settings, "SMTP_USER", "mailer")
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    assert mailer.send_mail("user@example.test", "Reset your password", f"Open {mailer.reset_link('tok123')}") is True
    kinds = [item[0] for item in sent]
    assert kinds == ["connect", "starttls", "login", "message"]
    assert "/reset-password?token=tok123" in sent[-1][3]


def test_starting_password_accepts_any_capitalisation_until_the_user_chooses_their_own(client, admin_headers, unique_email):
    created = client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Meghana", "email": unique_email, "role": "ACCOUNTS", "phone": "8600359985"})
    assert created.status_code == 201, created.text
    for typed in ("megh59985", "Megh59985", "MEGH59985"):
        assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": typed}).status_code == 200, typed
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": "megh59986"}).status_code == 401
    tokens = client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Megh59985"}).json()["data"]["tokens"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    # the forced "choose a password" step also accepts the capitalised current password
    changed = client.post("/api/v1/auth/password/change", headers=headers, json={
        "current_password": "Megh59985", "new_password": "Own#Secret2026", "confirm_password": "Own#Secret2026"})
    assert changed.status_code == 200, changed.text
    # after choosing their own password, case matters again
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": "own#secret2026"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Own#Secret2026"}).status_code == 200
    # and the old starting password no longer works in any capitalisation
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": "Megh59985"}).status_code == 401
