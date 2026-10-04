"""Domain workflow tests: booking maker/checker, collections, commissions."""

from __future__ import annotations

import uuid

import pytest


@pytest.fixture()
def approved_customer(client, admin_headers, unique_email, unique_phone):
    """Customer created by an admin (no owning agent)."""
    created = client.post(
        "/api/v1/customers",
        json={
            "name": "Workflow Customer",
            "email": unique_email,
            "phone": unique_phone,
            "city": "Mumbai",
            "pincode": "400001",
            "consent_given": True,
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    customer = created.json()["data"]
    decided = client.post(
        f"/api/v1/customers/{customer['id']}/decision",
        json={"status": "APPROVED", "reason": "KYC verified"},
        headers=admin_headers,
    )
    assert decided.status_code == 200
    return customer


@pytest.fixture()
def agent_approved_customer(client, agent_headers, admin_headers, unique_email, unique_phone):
    """Customer created *by the agent*, then approved — the legit agent flow."""
    created = client.post(
        "/api/v1/customers",
        json={
            "name": "Agent Booked Customer",
            "email": unique_email,
            "phone": unique_phone,
            "city": "Pune",
            "pincode": "411001",
            "consent_given": True,
        },
        headers=agent_headers,
    )
    assert created.status_code == 201, created.text
    customer = created.json()["data"]
    approved = client.post(
        f"/api/v1/customers/{customer['id']}/decision",
        json={"status": "APPROVED", "reason": "KYC verified"},
        headers=admin_headers,
    )
    assert approved.status_code == 200, approved.text
    return customer


@pytest.fixture()
def available_plot(client, admin_headers):
    """A guaranteed-fresh AVAILABLE plot (earlier tests consume the seeded ones)."""
    projects = client.get("/api/v1/projects", headers=admin_headers).json()["data"]
    assert projects, "seed data must contain at least one project"
    created = client.post(
        "/api/v1/plots",
        json={
            "plot_number": f"T-{uuid.uuid4().hex[:6].upper()}",
            "project_id": projects[0]["id"],
            "layout": "Layout T — Test",
            "area_sqft": "2400",
            "facing": "East",
            "price": "1800000",
            "status": "AVAILABLE",
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    return created.json()["data"]


def test_booking_by_agent_waits_for_approval_then_books_the_plot(
    client, agent_headers, admin_headers, agent_approved_customer, available_plot
):
    created = client.post(
        "/api/v1/bookings",
        json={
            "customer_id": agent_approved_customer["id"],
            "plot_id": available_plot["id"],
            "final_price": str(available_plot["price"]),
            "token_amount": "200000",
            "payment_plan": "12 monthly installments",
        },
        headers=agent_headers,
    )
    assert created.status_code == 201, created.text
    booking = created.json()["data"]
    assert booking["status"] == "PENDING_APPROVAL"

    plot_after = client.get(f"/api/v1/plots?search={available_plot['plot_number']}", headers=admin_headers)
    plot = next(p for p in plot_after.json()["data"] if p["id"] == available_plot["id"])
    assert plot["status"] == "HOLD", "agent bookings must hold the plot"

    approved = client.post(
        f"/api/v1/bookings/{booking['id']}/approve",
        json={"reason": "Price verified"},
        headers=admin_headers,
    )
    assert approved.status_code == 200
    assert approved.json()["data"]["status"] == "CONFIRMED"

    detail = client.get(f"/api/v1/bookings/{booking['id']}", headers=admin_headers).json()["data"]
    assert [entry["to_status"] for entry in detail["timeline"]] == ["CONFIRMED", "PENDING_APPROVAL"]
    assert detail["receipts"], "approval should issue the token receipt"


def test_double_booking_is_rejected(client, admin_headers, approved_customer, available_plot):
    body = {
        "customer_id": approved_customer["id"],
        "plot_id": available_plot["id"],
        "final_price": str(available_plot["price"]),
    }
    first = client.post("/api/v1/bookings", json=body, headers=admin_headers)
    assert first.status_code == 201
    second = client.post("/api/v1/bookings", json=body, headers=admin_headers)
    assert second.status_code == 409, "a plot cannot hold two live bookings"


def test_price_revision_requires_approval_permission(client, agent_headers, admin_headers,
                                                     approved_customer, available_plot):
    created = client.post(
        "/api/v1/bookings",
        json={
            "customer_id": approved_customer["id"],
            "plot_id": available_plot["id"],
            "final_price": str(available_plot["price"]),
        },
        headers=admin_headers,
    )
    booking_id = created.json()["data"]["id"]
    denied = client.patch(
        f"/api/v1/bookings/{booking_id}",
        json={"final_price": "1.00"},
        headers=agent_headers,
    )
    assert denied.status_code == 403


def test_payment_flow_creates_receipt_and_blocks_over_collection(
    client, admin_headers, accounts_headers, approved_customer, available_plot
):
    price = str(available_plot["price"])
    booking = client.post(
        "/api/v1/bookings",
        json={"customer_id": approved_customer["id"], "plot_id": available_plot["id"],
              "final_price": price},
        headers=admin_headers,
    ).json()["data"]

    partial = client.post(
        "/api/v1/payments",
        json={"booking_id": booking["id"], "amount": "100000", "mode": "UPI",
              "reference": "UPI-TEST-1"},
        headers=accounts_headers,
    )
    assert partial.status_code == 201, partial.text
    payment = partial.json()["data"]
    assert payment["receipt"]["receipt_number"].startswith("RCT-")
    assert payment["status"] == "PARTIALLY_PAID"

    over = client.post(
        "/api/v1/payments",
        json={"booking_id": booking["id"], "amount": "999999999", "mode": "NEFT"},
        headers=accounts_headers,
    )
    assert over.status_code == 409, "over-collection must be blocked by the service"

    receipt_id = payment["receipt"]["id"]
    copy = client.get(f"/api/v1/receipts/{receipt_id}/copy", headers=accounts_headers)
    assert copy.status_code == 200
    assert "Rupees" in copy.json()["data"]["amount_in_words"]

    shared = client.post(f"/api/v1/receipts/{receipt_id}/share", headers=accounts_headers)
    assert shared.status_code == 200


def test_commission_accrues_with_tds_split(client, admin_headers, agent_headers,
                                           agent_approved_customer, available_plot):
    """A commission only exists when a booking belongs to an agent."""
    booking = client.post(
        "/api/v1/bookings",
        json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
              "final_price": available_plot["price"]},
        headers=agent_headers,
    ).json()["data"]
    assert booking["status"] == "PENDING_APPROVAL"
    approved = client.post(
        f"/api/v1/bookings/{booking['id']}/approve",
        json={"reason": "Commission test"},
        headers=admin_headers,
    )
    assert approved.status_code == 200

    commissions = client.get("/api/v1/commissions", headers=admin_headers).json()["data"]
    mine = [c for c in commissions if c["booking_id"] == booking["id"]]
    assert mine, "a confirmed booking must accrue an agent commission"
    entry = mine[0]
    assert float(entry["net_amount"]) == pytest.approx(float(entry["gross_amount"]) - float(entry["tds_amount"]))


def test_agent_scoping_hides_other_agents_bookings(client, agent_headers):
    response = client.get("/api/v1/bookings", params={"page_size": 200}, headers=agent_headers)
    assert response.status_code == 200
    for booking in response.json()["data"]:
        assert booking["agent_name"] in (None, "S. Patel")


def test_dashboard_is_role_specific(client, admin_headers, agent_headers, accounts_headers):
    for headers, expected_role in ((admin_headers, "ADMIN"), (agent_headers, "SALES_AGENT"),
                                   (accounts_headers, "ACCOUNTS")):
        payload = client.get("/api/v1/dashboard", headers=headers).json()["data"]
        assert payload["role"] == expected_role
        assert payload["metrics"], "each role needs its own KPIs"


def test_approval_queue_and_rejection_releases_plot(client, admin_headers, agent_headers,
                                                    agent_approved_customer, available_plot):
    booking = client.post(
        "/api/v1/bookings",
        json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
              "final_price": available_plot["price"]},
        headers=agent_headers,
    ).json()["data"]

    queue = client.get("/api/v1/bookings/approvals", headers=admin_headers).json()["data"]
    assert any(item["id"] == booking["id"] for item in queue["bookings"])

    rejected = client.post(
        f"/api/v1/bookings/{booking['id']}/reject",
        json={"reason": "Duplicate enquiry"},
        headers=admin_headers,
    )
    assert rejected.status_code == 200
    assert rejected.json()["data"]["status"] == "REJECTED"

    plot = client.get(f"/api/v1/plots?search={available_plot['plot_number']}", headers=admin_headers)
    assert next(p for p in plot.json()["data"] if p["id"] == available_plot["id"])["status"] == "AVAILABLE"


def test_ledger_and_reports_render(client, accounts_headers, admin_headers):
    ledger = client.get("/api/v1/ledger", headers=accounts_headers)
    assert ledger.status_code == 200 and ledger.json()["meta"]["total"] >= 0

    summary = client.get("/api/v1/ledger/summary", headers=accounts_headers).json()["data"]
    assert {"contract_value", "collected", "outstanding", "aging"} <= set(summary)

    daily = client.get("/api/v1/reports/daily", headers=admin_headers)
    assert daily.status_code == 200
    assert daily.json()["data"]["report"] == "daily"
