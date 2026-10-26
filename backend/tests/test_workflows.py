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


def test_commission_accrues_on_each_payment_with_tds_split(client, admin_headers, agent_headers,
                                                           agent_approved_customer, available_plot):
    """The agent earns their rate on every payment the customer makes, not on the whole deal up front."""
    booking = client.post(
        "/api/v1/bookings",
        json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
              "final_price": available_plot["price"], "token_amount": "100000"},
        headers=agent_headers,
    ).json()["data"]
    assert booking["status"] == "PENDING_APPROVAL"

    def mine():
        rows = client.get("/api/v1/commissions", headers=admin_headers, params={"page_size": 200}).json()["data"]
        return sorted((c for c in rows if c["booking_id"] == booking["id"]), key=lambda c: c["id"])

    assert not mine(), "nothing is earned before any money has been received"
    approved = client.post(f"/api/v1/bookings/{booking['id']}/approve", json={"reason": "Commission test"},
                           headers=admin_headers)
    assert approved.status_code == 200
    first = mine()
    assert len(first) == 1 and float(first[0]["deal_value"]) == 100000

    paid = client.post("/api/v1/payments", headers=admin_headers,
                       json={"booking_id": booking["id"], "amount": "50000", "mode": "UPI"})
    assert paid.status_code == 201, paid.text
    entries = mine()
    assert [float(c["deal_value"]) for c in entries] == [100000, 50000]
    for entry in entries:
        assert float(entry["gross_amount"]) == pytest.approx(float(entry["deal_value"]) * float(entry["rate"]))
        assert float(entry["net_amount"]) == pytest.approx(float(entry["gross_amount"]) - float(entry["tds_amount"]))


def test_cancelled_payment_stops_counting_and_cancels_its_commission(client, admin_headers, agent_headers,
                                                                     agent_approved_customer, available_plot):
    booking = client.post(
        "/api/v1/bookings",
        json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
              "final_price": available_plot["price"], "token_amount": "100000"},
        headers=agent_headers,
    ).json()["data"]
    assert client.post(f"/api/v1/bookings/{booking['id']}/approve", json={"reason": "ok"}, headers=admin_headers).status_code == 200
    paid = client.post("/api/v1/payments", headers=admin_headers,
                       json={"booking_id": booking["id"], "amount": "50000", "mode": "UPI"}).json()["data"]

    def commissions():
        rows = client.get("/api/v1/commissions", headers=admin_headers, params={"page_size": 200}).json()["data"]
        return [c for c in rows if c["booking_id"] == booking["id"]]

    assert client.post(f"/api/v1/payments/{paid['id']}/cancel", headers=admin_headers, json={"reason": "x"}).status_code == 422
    cancelled = client.post(f"/api/v1/payments/{paid['id']}/cancel", headers=admin_headers, json={"reason": "Entered by mistake"})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["data"]["status"] == "CANCELLED"
    assert [(c["payment_id"] == paid["id"], c["status"]) for c in commissions() if c["payment_id"] == paid["id"]] == [(True, "CANCELLED")]
    assert [c["status"] for c in commissions() if c["payment_id"] != paid["id"]] != ["CANCELLED"]
    after = client.get(f"/api/v1/bookings/{booking['id']}", headers=admin_headers).json()["data"]
    assert float(after["paid_amount"]) == 100000
    again = client.post(f"/api/v1/payments/{paid['id']}/cancel", headers=admin_headers, json={"reason": "twice"})
    assert again.status_code == 422 or again.status_code == 400 or again.status_code == 409


def test_each_customer_payment_records_its_own_dated_commission_at_the_agents_rate(
        client, admin_headers, agent_headers, agent_approved_customer, available_plot):
    """A 14% agent: ₹1,00,000 on the 4th and ₹50,000 on the 17th give two entries, 14,000 and 7,000."""
    agents = client.get("/api/v1/agents", headers=admin_headers, params={"page_size": 100}).json()["data"]
    me = next(a for a in agents if a["name"] == "S. Patel")
    assert client.patch(f"/api/v1/agents/{me['id']}", headers=admin_headers,
                        json={"commission_rate": "0.14"}).status_code == 200
    booking = client.post(
        "/api/v1/bookings",
        json={"customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"],
              "final_price": available_plot["price"]},
        headers=agent_headers,
    ).json()["data"]
    assert client.post(f"/api/v1/bookings/{booking['id']}/approve", json={"reason": "ok"}, headers=admin_headers).status_code == 200
    for amount, day in (("100000", "2026-10-04"), ("50000", "2026-10-17")):
        paid = client.post("/api/v1/payments", headers=admin_headers,
                           json={"booking_id": booking["id"], "amount": amount, "mode": "UPI", "received_on": day})
        assert paid.status_code == 201, paid.text

    rows = client.get("/api/v1/commissions", headers=admin_headers, params={"page_size": 200}).json()["data"]
    mine = sorted((c for c in rows if c["booking_id"] == booking["id"]), key=lambda c: c["received_on"])
    assert [(c["received_on"], float(c["deal_value"]), float(c["rate"]), float(c["gross_amount"])) for c in mine] == [
        ("2026-10-04", 100000.0, 0.14, 14000.0), ("2026-10-17", 50000.0, 0.14, 7000.0)]
    assert all(c["status"] == "PAYABLE" for c in mine)


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


def test_customer_remembers_the_project_it_was_added_for(client, agent_headers, unique_email, unique_phone):
    projects = client.get("/api/v1/projects", headers=agent_headers).json()["data"]
    project = projects[0]
    created = client.post(
        "/api/v1/customers",
        headers=agent_headers,
        json={"name": "Project Scoped", "email": unique_email, "phone": unique_phone, "project_id": project["id"]},
    )
    assert created.status_code in (200, 201), created.text
    body = created.json()["data"]
    assert body["project_id"] == project["id"]
    assert body["project_name"] == project["name"]

    unknown = client.post(
        "/api/v1/customers",
        headers=agent_headers,
        json={"name": "Nowhere", "email": "nowhere-" + unique_email, "phone": "9" + unique_phone[1:][::-1], "project_id": 999999},
    )
    assert unknown.status_code == 409, unknown.text


def test_registry_stage_moves_the_booking_and_is_admin_only(client, admin_headers, agent_headers):
    bookings = client.get("/api/v1/bookings?page_size=50", headers=admin_headers).json()["data"]
    booking = next(b for b in bookings if b["status"] == "CONFIRMED")
    assert booking["registry_stage"] == "NOT_STARTED"
    url = f"/api/v1/bookings/{booking['id']}/registry"
    assert client.post(url, headers=agent_headers, json={"stage": "DOCUMENTS_PENDING"}).status_code in (403, 404)
    assert client.post(url, headers=admin_headers, json={"stage": "NONSENSE"}).status_code == 422

    docs = client.post(url, headers=admin_headers, json={"stage": "DOCUMENTS_PENDING"})
    assert docs.status_code == 200, docs.text
    assert docs.json()["data"]["registry_stage"] == "DOCUMENTS_PENDING" and docs.json()["data"]["status"] == "CONFIRMED"

    signed = client.post(url, headers=admin_headers, json={"stage": "AGREEMENT_SIGNED"})
    assert signed.json()["data"]["status"] == "AGREEMENT"          # the booking itself moved on

    done = client.post(url, headers=admin_headers, json={"stage": "REGISTERED"})
    assert done.json()["data"]["status"] == "REGISTERED"
    back = client.post(url, headers=admin_headers, json={"stage": "DOCUMENTS_PENDING"})
    assert back.status_code in (400, 409, 422)                     # registered bookings never go back


def test_next_due_date_drives_the_ledger_status(client, accounts_headers, agent_headers):
    rows = client.get("/api/v1/ledger?page_size=50", headers=accounts_headers).json()["data"]
    row = next(r for r in rows if float(r["balance"]) > 0 and r["due_date"])
    path = f"/api/v1/ledger/{row['booking_number']}/due-date"
    assert client.post(path, headers=agent_headers, json={"due_date": "2030-01-01"}).status_code == 403
    assert client.post(path, headers=accounts_headers, json={"due_date": "not-a-date"}).status_code == 422
    past = client.post(path, headers=accounts_headers, json={"due_date": "2020-01-01"})
    assert past.status_code == 200 and past.json()["data"]["status"] == "OVERDUE"
    future = client.post(path, headers=accounts_headers, json={"due_date": "2031-01-01"})
    assert future.json()["data"]["status"] in ("PENDING", "PARTIALLY_PAID")


def test_customer_ledger_shows_only_their_own_booking(client, customer_headers):
    """Regression: the agent-only row filter used to hide a portal customer's own booking."""
    me = client.get("/api/v1/auth/me", headers=customer_headers).json()["data"]["user"]
    mine = client.get("/api/v1/bookings?page_size=200", headers=customer_headers).json()["data"]
    ledger = client.get("/api/v1/ledger?page_size=200", headers=customer_headers)
    assert ledger.status_code == 200
    rows = ledger.json()["data"]
    assert len(rows) == len(mine) > 0, "a customer with bookings must see them in their ledger"
    assert {r["booking_number"] for r in rows} == {b["booking_number"] for b in mine}
    assert me["customer_id"]
