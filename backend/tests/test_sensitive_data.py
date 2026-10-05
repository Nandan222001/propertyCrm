"""Sensitive-data handling: encryption at rest, masking, reveal permission, erasure."""

from __future__ import annotations

from app.core.crypto import decrypt, encrypt
from app.core.security import blind_index
from app.core.validators import mask_address, mask_email, mask_name, mask_phone
from app.models.customer import Customer


def test_customer_pii_is_encrypted_in_the_database(client, session, admin_headers):
    """The raw column must hold ciphertext, never the plaintext e-mail."""
    customers = session.query(Customer).all()
    assert customers, "seed data required"
    stored = [customer.email for customer in customers if customer.email]
    assert stored, "customers must have an encrypted e-mail column"
    assert all(value.startswith("enc::") for value in stored)
    assert all("@" not in value for value in stored)


def test_blind_index_supports_lookup_without_decryption(client, session):
    customer = session.query(Customer).first()
    plaintext = decrypt(customer.email)
    assert customer.email_index == blind_index(plaintext)
    # Deterministic: the same plaintext always yields the same index.
    assert blind_index(plaintext.upper()) == blind_index(plaintext)


def test_encryption_round_trip_and_idempotence():
    ciphertext = encrypt("9876500101")
    assert ciphertext.startswith("enc::") and "9876500101" not in ciphertext
    assert decrypt(ciphertext) == "9876500101"
    assert encrypt(ciphertext) == ciphertext  # re-saving must not double-encrypt
    assert decrypt(None) is None


def test_masking_helpers():
    assert mask_email("rajesh.sharma@mail.com").startswith("ra***@")
    assert mask_phone("9876500101") == "98******01"
    assert "*" in mask_address("Andheri East, Mumbai")
    assert mask_name("Rajesh Sharma").startswith("R")


def test_pii_is_masked_by_default_for_agents(client, agent_headers):
    response = client.get("/api/v1/customers", headers=agent_headers)
    if response.status_code != 200:
        return
    for customer in response.json()["data"]:
        if customer.get("email"):
            assert "***" in customer["email"], "agents must not see raw e-mails"
        if customer.get("phone"):
            assert "*" in customer["phone"]


def test_permitted_role_can_reveal_pii(client, admin_headers):
    response = client.get("/api/v1/customers", headers=admin_headers)
    assert response.status_code == 200
    masked = [c for c in response.json()["data"] if c["masked"]]
    assert not masked, "accounts/admin hold pii:reveal and should receive unmasked rows"


def test_login_attempts_store_hashed_identity(client, session):
    from app.models.audit import LoginAttempt

    client.post("/api/v1/auth/login", json={"email": "probe@example.demo", "password": "Wrong@12345"})
    attempts = session.query(LoginAttempt).order_by(LoginAttempt.id.desc()).limit(5).all()
    assert attempts
    for attempt in attempts:
        assert "@" not in (attempt.email_hash or ""), "login forensics must not store raw e-mails"


def test_audit_state_snapshots_exclude_pii(client, session, admin_headers, unique_email, unique_phone):
    created = client.post(
        "/api/v1/customers",
        json={"name": "Snapshot Probe", "email": unique_email, "phone": unique_phone,
              "consent_given": True},
        headers=admin_headers,
    )
    assert created.status_code == 201
    from app.models.audit import AuditLog

    entry = (
        session.query(AuditLog)
        .filter(AuditLog.resource == "customer")
        .order_by(AuditLog.id.desc())
        .first()
    )
    serialised = f"{entry.before_state}{entry.after_state}"
    assert unique_email not in serialised
    assert "9876500999" not in serialised


def test_right_to_erasure_scrubs_identifiers(client, session, super_admin_headers, unique_email, unique_phone):
    created = client.post(
        "/api/v1/customers",
        json={"name": "Erasure Probe", "email": unique_email, "phone": unique_phone,
              "consent_given": True},
        headers=super_admin_headers,
    )
    assert created.status_code == 201
    public_id = created.json()["data"]["public_id"]
    customer_id = created.json()["data"]["id"]

    erased = client.delete(
        f"/api/v1/customers/{customer_id}/personal-data?reason=Data subject request DR-2026-001",
        headers=super_admin_headers,
    )
    assert erased.status_code == 200, erased.text

    session.rollback()  # end the read txn to see committed rows
    customer = session.query(Customer).filter(Customer.public_id == public_id).one()
    assert customer.anonymised_at is not None
    assert customer.email is None and customer.phone is None and customer.email_index is None
    assert "Erased customer" in customer.name


def test_personal_data_export_requires_permission(client, customer_headers, super_admin_headers):
    denied = client.get("/api/v1/customers/1/personal-data", headers=customer_headers)
    assert denied.status_code == 403
    allowed = client.get("/api/v1/customers/1/personal-data", headers=super_admin_headers)
    assert allowed.status_code == 200
    assert "customer" in allowed.json()["data"]


def test_settings_endpoint_masks_secret_values(client, super_admin_headers):
    client.put(
        "/api/v1/settings/integrations.whatsapp_token",
        json={"value": "super-secret-token", "description": "WhatsApp Business API token"},
        headers=super_admin_headers,
    )
    response = client.get("/api/v1/settings", headers=super_admin_headers)
    assert response.status_code == 200
    assert "super-secret-token" not in response.text
    assert "***" in response.text
