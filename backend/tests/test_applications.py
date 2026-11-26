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


def test_an_application_receipt_with_swapped_fees_can_be_corrected(client, agent_headers, admin_headers, agent_approved_customer, available_plot):
    made = apply(client, agent_headers, agent_approved_customer, available_plot, application_fee="5000", enrollment_fee="500").json()["data"]
    url = f"/api/v1/applications/{made['id']}"
    fixed = client.patch(url, headers=admin_headers, json={"application_fee": "500", "enrollment_fee": "5000", "payment_mode": "cash"})
    assert fixed.status_code == 200, fixed.text
    data = fixed.json()["data"]
    assert (float(data["application_fee"]), float(data["enrollment_fee"]), data["payment_mode"]) == (500, 5000, "CASH")
    # only an approver may correct it, and it cannot be zeroed
    assert client.patch(url, headers=agent_headers, json={"application_fee": "1"}).status_code == 403
    assert client.patch(url, headers=admin_headers, json={"application_fee": "0", "enrollment_fee": "0"}).status_code in (409, 422)


def test_a_cancelled_application_stops_counting_as_collection(client, admin_headers, agent_approved_customer, available_plot):
    from decimal import Decimal

    def collected():
        return Decimal(client.get("/api/v1/expenses/profit-summary", headers=admin_headers).json()["data"]["collected"])

    base = collected()
    made = apply(client, admin_headers, agent_approved_customer, available_plot).json()["data"]
    assert collected() - base == Decimal("5000")
    assert client.post(f"/api/v1/applications/{made['id']}/cancel", headers=admin_headers, json={"reason": "entered twice"}).status_code == 200
    assert collected() == base
    assert client.post(f"/api/v1/applications/{made['id']}/cancel", headers=admin_headers, json={"reason": "again"}).status_code in (409, 422)


def test_deleting_a_customer_erases_their_application_fees_too(client, admin_headers, unique_email, unique_phone, available_plot):
    from decimal import Decimal

    def collected():
        return Decimal(client.get("/api/v1/expenses/profit-summary", headers=admin_headers).json()["data"]["collected"])

    customer = client.post("/api/v1/customers", headers=admin_headers, json={
        "name": "Fee Probe", "email": unique_email, "phone": unique_phone, "consent_given": True}).json()["data"]
    client.post(f"/api/v1/customers/{customer['id']}/approve", headers=admin_headers)
    base = collected()
    made = apply(client, admin_headers, customer, available_plot)
    assert made.status_code == 201, made.text
    assert collected() - base == Decimal("5000")
    assert client.delete(f"/api/v1/customers/{customer['id']}", headers=admin_headers).status_code == 200
    assert collected() == base
    listed = client.get("/api/v1/applications", headers=admin_headers, params={"page_size": 200}).json()["data"]
    assert made.json()["data"]["id"] not in {a["id"] for a in listed}


def _enrollment_commissions(client, headers, application_id):
    rows = client.get("/api/v1/commissions", headers=headers, params={"page_size": 200}).json()["data"]
    return [c for c in rows if c["application_id"] == application_id]


def test_the_agent_earns_commission_on_the_enrollment_fee_but_not_the_application_fee(
        client, agent_headers, admin_headers, agent_approved_customer, available_plot):
    made = apply(client, agent_headers, agent_approved_customer, available_plot).json()["data"]     # application 500, enrollment 5000
    mine = _enrollment_commissions(client, admin_headers, made["id"])
    assert len(mine) == 1, mine
    row = mine[0]
    assert float(row["deal_value"]) == 5000                                    # the enrollment fee only — never the 500
    assert round(float(row["gross_amount"]), 2) == round(5000 * float(row["rate"]), 2) > 0
    assert row["status"] == "PAYABLE" and row["project_name"] and row["booking_id"] is None and row["payment_id"] is None
    seen = _enrollment_commissions(client, agent_headers, made["id"])
    assert [c["id"] for c in seen] == [row["id"]]                              # the agent sees it on their own list

    # Correcting the enrollment fee recalculates it.
    assert client.patch(f"/api/v1/applications/{made['id']}", headers=admin_headers, json={"enrollment_fee": "8000"}).status_code == 200
    again = _enrollment_commissions(client, admin_headers, made["id"])
    assert len(again) == 1 and float(again[0]["deal_value"]) == 8000
    # Changing only the application fee leaves the commission alone.
    assert client.patch(f"/api/v1/applications/{made['id']}", headers=admin_headers, json={"application_fee": "900"}).status_code == 200
    assert [c["id"] for c in _enrollment_commissions(client, admin_headers, made["id"])] == [again[0]["id"]]

    # Cancelling the application cancels its commission.
    assert client.post(f"/api/v1/applications/{made['id']}/cancel", headers=admin_headers, json={"reason": "entered twice"}).status_code == 200
    assert {c["status"] for c in _enrollment_commissions(client, admin_headers, made["id"])} == {"CANCELLED"}


def test_a_paid_out_enrollment_commission_cannot_be_changed_or_cancelled(
        client, agent_headers, admin_headers, accounts_headers, agent_approved_customer, available_plot):
    made = apply(client, agent_headers, agent_approved_customer, available_plot).json()["data"]
    commission = _enrollment_commissions(client, admin_headers, made["id"])[0]
    for status, who in (("APPROVED", admin_headers), ("PAID", accounts_headers)):      # the payout is the accounts desk's step
        done = client.post(f"/api/v1/commissions/{commission['id']}/decision", headers=who,
                           json={"status": status, "payout_reference": "NEFT-1", "reason": "ok"})
        assert done.status_code == 200, done.text
    url = f"/api/v1/applications/{made['id']}"
    assert client.patch(url, headers=admin_headers, json={"enrollment_fee": "9000"}).status_code == 409
    assert client.post(f"{url}/cancel", headers=admin_headers, json={"reason": "entered by mistake"}).status_code == 409
    assert float(_enrollment_commissions(client, admin_headers, made["id"])[0]["deal_value"]) == 5000


def test_enrollment_commission_follows_the_team_chain_and_goes_with_a_deleted_customer(
        client, agent_headers, admin_headers, unique_phone, available_plot):
    from tests.test_agent_hierarchy import _add, _agent_named, _sign_in

    top = _agent_named(client, admin_headers, "S. Patel")
    assert client.patch(f"/api/v1/agents/{top['id']}", headers=admin_headers, json={"commission_rate": "0.20"}).status_code == 200
    import uuid

    email = f"{uuid.uuid4().hex[:8]}@example.demo"
    assert client.post("/api/v1/agents/team", headers=agent_headers, json={
        "name": "Enrol Agent", "email": email, "phone": unique_phone, "share": "0.14"}).status_code == 201
    sub = _sign_in(client, email, "Enrol Agent", unique_phone)
    phone = "8" + unique_phone[1:][::-1]
    customer = client.post("/api/v1/customers", headers=sub, json={
        "name": "Enrol Customer", "email": f"{uuid.uuid4().hex[:8]}@example.demo", "phone": phone, "city": "Pune",
        "pincode": "411001", "consent_given": True}).json()["data"]
    assert client.post(f"/api/v1/customers/{customer['id']}/decision", headers=admin_headers,
                       json={"status": "APPROVED", "reason": "KYC"}).status_code == 200
    made = apply(client, sub, customer, available_plot).json()["data"]

    rows = {c["agent_name"]: c for c in _enrollment_commissions(client, admin_headers, made["id"])}
    assert {k: float(v["gross_amount"]) for k, v in rows.items()} == {"Enrol Agent": 700.0, "S. Patel": 300.0}   # 14% + 6% of 5000
    assert rows["S. Patel"]["is_override"] and rows["S. Patel"]["source_agent_name"] == "Enrol Agent"

    assert client.delete(f"/api/v1/customers/{customer['id']}", headers=admin_headers).status_code == 200
    assert _enrollment_commissions(client, admin_headers, made["id"]) == []


def test_a_customer_sees_the_receipts_of_their_own_applications_only(
        client, agent_headers, admin_headers, customer_headers, agent_approved_customer, available_plot):
    made = apply(client, agent_headers, agent_approved_customer, available_plot).json()["data"]     # another customer's application
    mine = client.get("/api/v1/applications", headers=customer_headers, params={"page_size": 200})
    assert mine.status_code == 200, mine.text
    assert made["id"] not in {a["id"] for a in mine.json()["data"]}                                 # never somebody else's
    # the seeded portal customer's own application is visible to them
    data = client.get("/api/v1/auth/me", headers=customer_headers).json()["data"]
    customer_id = data.get("user", data)["customer_id"]
    assert customer_id
    own = apply(client, admin_headers, {"id": customer_id}, available_plot).json()["data"]
    listed = client.get("/api/v1/applications", headers=customer_headers, params={"page_size": 200}).json()["data"]
    assert own["id"] in {a["id"] for a in listed} and all(a["customer_id"] == customer_id for a in listed)
