"""Step 1 of a booking: the application fee and enrollment fee, taken before any plot is allotted."""

from __future__ import annotations

from tests.test_workflows import agent_approved_customer, available_plot  # noqa: F401


def apply(client, headers, customer, plot, **extra):
    return client.post("/api/v1/applications", headers=headers, json={
        "customer_id": customer["id"], "project_id": plot["project_id"], "application_fee": "500", "enrollment_fee": "5000",
        "payment_mode": "UPI", "reference": "TXN1", "paid_to": "Company bank account", **extra})


def test_application_takes_the_fees_and_issues_a_receipt(client, agent_headers, admin_headers, agent_approved_customer, available_plot):
    created = apply(client, agent_headers, agent_approved_customer, available_plot)
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    assert data["receipt_number"].startswith("APP-") and float(data["total"]) == 5500
    assert data["status"] == "OPEN" and data["customer_name"] and data["project_name"] and data["paid_to"] == "Company bank account"
    # a second application gets the next receipt number
    again = apply(client, agent_headers, agent_approved_customer, available_plot).json()["data"]
    assert again["receipt_number"] != data["receipt_number"]
    listed = client.get("/api/v1/applications", headers=admin_headers, params={"page_size": 200}).json()["data"]
    assert {data["id"], again["id"]} <= {a["id"] for a in listed}


def test_application_needs_an_amount_and_an_approved_customer(client, agent_headers, agent_approved_customer, available_plot):
    nothing = apply(client, agent_headers, agent_approved_customer, available_plot, application_fee="0", enrollment_fee="0")
    assert nothing.status_code == 422
    assert apply(client, agent_headers, agent_approved_customer, available_plot, payment_mode="barter").status_code == 422


def test_allotting_a_plot_closes_the_application(client, agent_headers, admin_headers, agent_approved_customer, available_plot):
    application = apply(client, agent_headers, agent_approved_customer, available_plot).json()["data"]
    booking = client.post("/api/v1/bookings", headers=agent_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"], "final_price": available_plot["price"],
        "application_id": application["id"]})
    assert booking.status_code == 201, booking.text
    rows = client.get("/api/v1/applications", headers=admin_headers, params={"page_size": 200}).json()["data"]
    closed = next(a for a in rows if a["id"] == application["id"])
    assert closed["status"] == "ALLOTTED" and closed["booking_number"] == booking.json()["data"]["booking_number"]


def test_a_rejected_booking_reopens_the_application(client, agent_headers, admin_headers, agent_approved_customer, available_plot):
    application = apply(client, agent_headers, agent_approved_customer, available_plot).json()["data"]
    booking = client.post("/api/v1/bookings", headers=agent_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": available_plot["id"], "final_price": available_plot["price"],
        "application_id": application["id"]}).json()["data"]
    assert client.post(f"/api/v1/bookings/{booking['id']}/reject", headers=admin_headers, json={"reason": "no"}).status_code == 200
    rows = client.get("/api/v1/applications", headers=admin_headers, params={"page_size": 200}).json()["data"]
    reopened = next(a for a in rows if a["id"] == application["id"])
    assert reopened["status"] == "OPEN" and reopened["booking_id"] is None
