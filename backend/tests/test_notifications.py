"""Notifications reach only the people they are addressed to."""

from __future__ import annotations


def _me(client, headers) -> dict:
    data = client.get("/api/v1/auth/me", headers=headers).json()["data"]
    return data.get("user", data)


def _queue(client, headers) -> list[dict]:
    response = client.get("/api/v1/notifications", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _titles(client, headers) -> set[str]:
    return {n["title"] for n in _queue(client, headers)}


def test_role_notification_is_not_visible_to_other_roles(
    client, admin_headers, agent_headers, accounts_headers, customer_headers
):
    created = client.post(
        "/api/v1/notifications", headers=admin_headers,
        json={"title": "Admin-only heads up", "audience_role": "ADMIN", "category": "APPROVAL"},
    )
    assert created.status_code == 201, created.text

    assert "Admin-only heads up" in _titles(client, admin_headers)
    assert "Admin-only heads up" not in _titles(client, agent_headers)
    assert "Admin-only heads up" not in _titles(client, accounts_headers)
    assert "Admin-only heads up" not in _titles(client, customer_headers)


def test_customer_never_sees_a_staff_notification_that_mentions_them(client, admin_headers, customer_headers):
    """The seeded 'Payment overdue' alert is for Accounts; its customer must not receive it."""
    customers = client.get("/api/v1/customers?page_size=200", headers=admin_headers).json()["data"]
    me = _me(client, customer_headers)
    mine = next(c for c in customers if c["id"] == me["customer_id"])
    client.post(
        "/api/v1/notifications", headers=admin_headers,
        json={"title": "Accounts follow-up", "audience_role": "ACCOUNTS", "customer_id": mine["id"]},
    )
    assert "Accounts follow-up" not in _titles(client, customer_headers)


def test_personal_notification_reaches_only_that_user(client, admin_headers, agent_headers, accounts_headers):
    me = _me(client, agent_headers)
    client.post(
        "/api/v1/notifications", headers=admin_headers,
        json={"title": "Just for the agent", "audience_role": "SALES_AGENT", "user_id": me["id"]},
    )
    assert "Just for the agent" in _titles(client, agent_headers)
    assert "Just for the agent" not in _titles(client, admin_headers)
    assert "Just for the agent" not in _titles(client, accounts_headers)


def test_cannot_read_or_action_someone_elses_notification(client, admin_headers, agent_headers):
    created = client.post(
        "/api/v1/notifications", headers=admin_headers,
        json={"title": "Private to admins", "audience_role": "ADMIN"},
    ).json()["data"]
    for path in ("read", "action"):
        response = client.post(f"/api/v1/notifications/{created['id']}/{path}", headers=agent_headers)
        assert response.status_code == 403, (path, response.text)
    assert client.post(f"/api/v1/notifications/{created['id']}/action", headers=admin_headers).status_code == 200


def test_new_customer_notifies_admin_and_the_decision_notifies_the_agent(
    client, admin_headers, agent_headers, accounts_headers, unique_email, unique_phone
):
    created = client.post(
        "/api/v1/customers", headers=agent_headers,
        json={"name": "Notify Probe", "email": unique_email, "phone": unique_phone},
    )
    assert created.status_code in (200, 201), created.text
    customer_id = created.json()["data"]["id"]

    assert "Customer awaiting approval" in _titles(client, admin_headers)
    assert "Customer awaiting approval" not in _titles(client, agent_headers)
    assert "Customer awaiting approval" not in _titles(client, accounts_headers)

    decided = client.post(
        f"/api/v1/customers/{customer_id}/decision", headers=admin_headers,
        json={"status": "APPROVED", "reason": "ok"},
    )
    assert decided.status_code == 200, decided.text
    assert "Customer approved" in _titles(client, agent_headers)
    assert "Customer approved" not in _titles(client, accounts_headers)


def test_agent_linked_only_by_code_still_gets_decision_notifications(client, admin_headers, unique_email, unique_phone):
    """Agents created from the admin screen are linked to their login by agent code only."""
    code = "AG-NTF1"
    assert client.post("/api/v1/agents", headers=admin_headers,
                       json={"name": "Code Linked", "code": code}).status_code == 201
    email = f"codelinked-{unique_email}"
    created = client.post("/api/v1/users", headers=admin_headers, json={
        "name": "Code Linked", "email": email, "role": "SALES_AGENT",
        "phone": "9876500005", "agent_code": code,
    })
    assert created.status_code in (200, 201), created.text
    token = client.post("/api/v1/auth/login", json={"email": email, "password": "code00005"})
    assert token.status_code == 200, token.text
    agent_headers = {"Authorization": f"Bearer {token.json()['data']['tokens']['access_token']}"}
    customer = client.post("/api/v1/customers", headers=agent_headers, json={
        "name": "Linked Probe", "email": unique_email, "phone": unique_phone,
    })
    assert customer.status_code in (200, 201), customer.text
    client.post(f"/api/v1/customers/{customer.json()['data']['id']}/decision", headers=admin_headers,
                json={"status": "APPROVED"})
    assert "Customer approved" in _titles(client, agent_headers)
