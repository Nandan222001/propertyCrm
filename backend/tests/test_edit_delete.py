# ruff: noqa: F811
"""Edit / delete from the Actions column: who may do what, and the guard rails."""

from __future__ import annotations

import uuid

from tests.test_workflows import agent_approved_customer, approved_customer, available_plot  # noqa: F401


def _new_customer(client, headers, email, phone, name="Edit Probe"):
    created = client.post("/api/v1/customers", headers=headers,
                          json={"name": name, "email": email, "phone": phone, "consent_given": True})
    assert created.status_code == 201, created.text
    return created.json()["data"]


def test_agent_edits_and_removes_own_pending_customer_only(client, agent_headers, admin_headers, unique_email, unique_phone):
    mine = _new_customer(client, agent_headers, unique_email, unique_phone)
    edited = client.patch(f"/api/v1/customers/{mine['id']}", headers=agent_headers, json={"name": "Renamed Probe", "city": "Pune"})
    assert edited.status_code == 200  # (the agent reads the name back masked, by design)
    assert client.delete(f"/api/v1/customers/{mine['id']}", headers=agent_headers).status_code == 200

    # An approved customer can only be removed by the admin.
    second = _new_customer(client, agent_headers, "x" + unique_email, "9" + unique_phone[1:][::-1], "Approved Probe")
    client.post(f"/api/v1/customers/{second['id']}/decision", headers=admin_headers, json={"status": "APPROVED"})
    assert client.delete(f"/api/v1/customers/{second['id']}", headers=agent_headers).status_code == 403
    assert client.delete(f"/api/v1/customers/{second['id']}", headers=admin_headers).status_code == 200


def test_agent_cannot_touch_another_agents_customer(client, agent_headers, admin_headers):
    mine = {c["id"] for c in client.get("/api/v1/customers?page_size=200", headers=agent_headers).json()["data"]}
    other = next(c for c in client.get("/api/v1/customers?page_size=200", headers=admin_headers).json()["data"]
                 if c["id"] not in mine)
    assert client.patch(f"/api/v1/customers/{other['id']}", headers=agent_headers, json={"city": "Nowhere"}).status_code == 403
    assert client.delete(f"/api/v1/customers/{other['id']}", headers=agent_headers).status_code == 403


def test_customer_with_active_booking_cannot_be_deleted(client, admin_headers, agent_approved_customer, available_plot):
    booking = client.post("/api/v1/bookings", headers=admin_headers,
                          json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
                                "final_price": available_plot["price"]})
    assert booking.status_code == 201, booking.text
    blocked = client.delete(f"/api/v1/customers/{agent_approved_customer['id']}", headers=admin_headers)
    assert blocked.status_code in (400, 409, 422), blocked.text


def test_agent_removes_own_pending_booking_and_plot_is_released(client, agent_headers, admin_headers,
                                                                 agent_approved_customer, available_plot):
    booking = client.post("/api/v1/bookings", headers=agent_headers,
                          json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
                                "final_price": available_plot["price"]}).json()["data"]
    edited = client.patch(f"/api/v1/bookings/{booking['id']}", headers=agent_headers, json={"notes": "Call after 5pm"})
    assert edited.status_code == 200, edited.text
    assert client.delete(f"/api/v1/bookings/{booking['id']}", headers=agent_headers).status_code == 200
    plots = client.get(f"/api/v1/plots?search={available_plot['plot_number']}", headers=admin_headers).json()["data"]
    assert next(p for p in plots if p["id"] == available_plot["id"])["status"] == "AVAILABLE"


def test_agent_cannot_delete_a_confirmed_booking_but_admin_can_when_unpaid(client, agent_headers, admin_headers,
                                                                          agent_approved_customer, available_plot):
    booking = client.post("/api/v1/bookings", headers=agent_headers,
                          json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
                                "final_price": available_plot["price"]}).json()["data"]
    assert client.post(f"/api/v1/bookings/{booking['id']}/approve", headers=admin_headers, json={}).status_code == 200
    assert client.patch(f"/api/v1/bookings/{booking['id']}", headers=agent_headers, json={"notes": "x"}).status_code == 403
    assert client.delete(f"/api/v1/bookings/{booking['id']}", headers=agent_headers).status_code == 403
    assert client.delete(f"/api/v1/bookings/{booking['id']}", headers=admin_headers).status_code == 200


def test_project_and_plot_deletion_guard_rails(client, admin_headers, agent_headers):
    project = client.post("/api/v1/projects", headers=admin_headers,
                          json={"name": f"Delete Probe {uuid.uuid4().hex[:5]}", "location": "Pune", "total_plots": 2}).json()["data"]
    plot = client.post("/api/v1/plots", headers=admin_headers,
                       json={"plot_number": "D-1", "project_id": project["id"], "layout": "L", "area_sqft": "1000",
                             "facing": "East", "price": "1000000", "status": "BOOKED"})
    assert plot.status_code == 201, plot.text
    plot = plot.json()["data"]
    assert client.delete(f"/api/v1/plots/{plot['id']}", headers=agent_headers).status_code == 403
    assert client.delete(f"/api/v1/plots/{plot['id']}", headers=admin_headers).status_code in (400, 409, 422)
    assert client.delete(f"/api/v1/projects/{project['id']}", headers=admin_headers).status_code in (400, 409, 422)
    assert client.patch(f"/api/v1/plots/{plot['id']}", headers=admin_headers, json={"status": "AVAILABLE"}).status_code == 200
    assert client.delete(f"/api/v1/projects/{project['id']}", headers=admin_headers).status_code == 200


def test_agent_deletion_rules(client, admin_headers, agent_headers):
    fresh = client.post("/api/v1/agents", headers=admin_headers,
                        json={"name": "Temp Agent", "code": f"T{uuid.uuid4().hex[:5].upper()}", "commission_rate": "0.02"})
    assert fresh.status_code == 201, fresh.text
    agent = fresh.json()["data"]
    assert client.delete(f"/api/v1/agents/{agent['id']}", headers=agent_headers).status_code == 403
    assert client.delete(f"/api/v1/agents/{agent['id']}", headers=admin_headers).status_code == 200
    with_deals = next(a for a in client.get("/api/v1/agents?page_size=200", headers=admin_headers).json()["data"]
                      if a["code"] == "AG-014" or a["name"].startswith("M."))
    assert client.delete(f"/api/v1/agents/{with_deals['id']}", headers=admin_headers).status_code in (400, 409, 422)


def test_new_customer_gets_a_portal_login_from_email_and_starting_password(client, agent_headers, admin_headers,
                                                                          unique_email, unique_phone):
    from tests.conftest import starting_password

    created = client.post("/api/v1/customers", headers=agent_headers, json={
        "name": "Portal Person", "email": unique_email, "phone": unique_phone, "consent_given": True})
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    password = starting_password("Portal Person", unique_phone)
    assert data["portal_login"].startswith("login created") and password not in created.text

    login = client.post("/api/v1/auth/login", json={"email": unique_email, "password": password})
    assert login.status_code == 200, login.text
    user = login.json()["data"]["user"]
    assert user["role"] == "CUSTOMER" and user["must_change_password"] is True and user["customer_id"] == data["id"]
    headers = {"Authorization": f"Bearer {login.json()['data']['tokens']['access_token']}"}
    assert client.get("/api/v1/bookings", headers=headers).json()["data"] == []
    assert client.get("/api/v1/users", headers=headers).status_code == 403

    # approval keeps the login working; a rejected customer is locked out
    client.post(f"/api/v1/customers/{data['id']}/decision", headers=admin_headers, json={"status": "APPROVED"})
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": password}).status_code == 200
    other_phone = "9" + unique_phone[1:][::-1]
    other = client.post("/api/v1/customers", headers=agent_headers, json={
        "name": "Rejected Person", "email": "r-" + unique_email, "phone": other_phone}).json()["data"]
    other_password = starting_password("Rejected Person", other_phone)
    assert client.post("/api/v1/auth/login", json={"email": "r-" + unique_email, "password": other_password}).status_code == 200
    client.post(f"/api/v1/customers/{other['id']}/decision", headers=admin_headers, json={"status": "REJECTED"})
    assert client.post("/api/v1/auth/login", json={"email": "r-" + unique_email, "password": other_password}).status_code in (401, 403)

    # deleting the customer removes the login
    assert client.delete(f"/api/v1/customers/{data['id']}", headers=admin_headers).status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": unique_email, "password": password}).status_code in (401, 403)


def test_customer_login_is_skipped_with_a_reason_when_it_cannot_be_built(client, agent_headers, unique_email, unique_phone):
    created = client.post("/api/v1/customers", headers=agent_headers, json={
        "name": "Al", "email": unique_email, "phone": unique_phone})
    assert created.status_code == 201, created.text
    assert created.json()["data"]["portal_login"].startswith("no login created")
    clash = client.post("/api/v1/customers", headers=agent_headers, json={
        "name": "Admin Clash", "email": "admin@nmtsolution.demo", "phone": "9" + unique_phone[1:][::-1]})
    assert clash.status_code in (201, 409)
    if clash.status_code == 201:
        assert "another account" in clash.json()["data"]["portal_login"]


def test_admin_edits_plot_details_but_an_agent_cannot(client, admin_headers, agent_headers, available_plot):
    changes = {"layout": "Layout Z — Revised", "facing": "North", "area_sqft": "2600", "price": "2100000"}
    assert client.patch(f"/api/v1/plots/{available_plot['id']}", headers=agent_headers, json=changes).status_code == 403
    edited = client.patch(f"/api/v1/plots/{available_plot['id']}", headers=admin_headers, json=changes)
    assert edited.status_code == 200, edited.text
    data = edited.json()["data"]
    assert data["layout"] == "Layout Z — Revised" and data["facing"] == "North" and float(data["price"]) == 2100000
