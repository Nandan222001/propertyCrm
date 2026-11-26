"""Company expenses and the profit-till-date figure."""

from __future__ import annotations

from datetime import date, timedelta

from tests.test_workflows import agent_approved_customer, approved_customer, available_plot  # noqa: F401
from decimal import Decimal

EXPENSE = {"category": "Office rent", "description": "October office rent", "amount": 25000,
           "expense_date": date.today().isoformat(), "paid_to": "Landlord", "payment_mode": "Bank transfer"}


def summary(client, headers) -> dict:
    response = client.get("/api/v1/expenses/profit-summary", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_accounts_records_edits_and_deletes_expenses_and_profit_follows(client, accounts_headers):
    before = summary(client, accounts_headers)
    created = client.post("/api/v1/expenses", headers=accounts_headers, json=EXPENSE)
    assert created.status_code == 201, created.text
    row = created.json()["data"]
    assert Decimal(row["amount"]) == Decimal("25000")

    after = summary(client, accounts_headers)
    assert Decimal(after["expenses"]) - Decimal(before["expenses"]) == Decimal("25000")
    assert Decimal(after["profit"]) == Decimal(after["collected"]) - Decimal(after["commissions"]) - Decimal(after["expenses"])
    assert Decimal(before["profit"]) - Decimal(after["profit"]) == Decimal("25000")

    listed = client.get("/api/v1/expenses", headers=accounts_headers).json()["data"]
    assert any(item["id"] == row["id"] for item in listed)

    edited = client.put(f"/api/v1/expenses/{row['id']}", headers=accounts_headers, json={**EXPENSE, "amount": 30000})
    assert edited.status_code == 200, edited.text
    assert Decimal(summary(client, accounts_headers)["expenses"]) - Decimal(before["expenses"]) == Decimal("30000")

    assert client.delete(f"/api/v1/expenses/{row['id']}", headers=accounts_headers).status_code == 200
    assert summary(client, accounts_headers)["expenses"] == before["expenses"]


def test_admin_can_use_expenses_but_agents_and_customers_cannot(client, admin_headers, agent_headers, customer_headers):
    assert client.get("/api/v1/expenses", headers=admin_headers).status_code == 200
    assert client.post("/api/v1/expenses", headers=admin_headers, json=EXPENSE).status_code == 201
    for headers in (agent_headers, customer_headers):
        assert client.get("/api/v1/expenses", headers=headers).status_code == 403
        assert client.get("/api/v1/expenses/profit-summary", headers=headers).status_code == 403
        assert client.post("/api/v1/expenses", headers=headers, json=EXPENSE).status_code == 403


def test_expense_rules(client, accounts_headers):
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert client.post("/api/v1/expenses", headers=accounts_headers, json={**EXPENSE, "amount": 0}).status_code == 422
    assert client.post("/api/v1/expenses", headers=accounts_headers, json={**EXPENSE, "amount": -5}).status_code == 422
    assert client.post("/api/v1/expenses", headers=accounts_headers, json={**EXPENSE, "expense_date": tomorrow}).status_code == 422
    assert client.post("/api/v1/expenses", headers=accounts_headers, json={**EXPENSE, "description": ""}).status_code == 422


def test_profit_summary_can_be_limited_to_a_date_range(client, accounts_headers):
    old_day = (date.today() - timedelta(days=400)).isoformat()
    assert client.post("/api/v1/expenses", headers=accounts_headers,
                       json={**EXPENSE, "amount": 777, "expense_date": old_day}).status_code == 201
    window = client.get("/api/v1/expenses/profit-summary", headers=accounts_headers,
                        params={"date_from": old_day, "date_to": old_day})
    assert window.status_code == 200, window.text
    assert Decimal(window.json()["data"]["expenses"]) == Decimal("777")
    recent = client.get("/api/v1/expenses/profit-summary", headers=accounts_headers,
                        params={"date_from": (date.today() - timedelta(days=7)).isoformat()})
    assert Decimal(recent.json()["data"]["expenses"]) <= Decimal(summary(client, accounts_headers)["expenses"]) - Decimal("777")


def test_enrollment_money_counts_as_collection_but_the_application_fee_does_not(
        client, admin_headers, agent_approved_customer, available_plot):
    before = client.get("/api/v1/expenses/profit-summary", headers=admin_headers).json()["data"]
    made = client.post("/api/v1/applications", headers=admin_headers, json={
        "customer_id": agent_approved_customer["id"], "project_id": available_plot["project_id"],
        "application_fee": "500", "enrollment_fee": "5000", "payment_mode": "UPI"})
    assert made.status_code == 201, made.text
    after = client.get("/api/v1/expenses/profit-summary", headers=admin_headers).json()["data"]
    assert Decimal(after["collected"]) - Decimal(before["collected"]) == Decimal("5000")      # the 500 application fee is not counted
    # The agent earns commission on the enrollment fee, so profit rises by that money less the commission on it.
    commission = Decimal(after["commissions"]) - Decimal(before["commissions"])
    assert 0 < commission < Decimal("5000")
    assert Decimal(after["profit"]) - Decimal(before["profit"]) == Decimal("5000") - commission


def test_agent_payout_names_the_agent_is_capped_at_what_is_owed_and_is_not_deducted_twice(
        client, admin_headers, agent_headers, approved_customer, available_plot):
    agent = next(a for a in client.get("/api/v1/agents", headers=admin_headers, params={"page_size": 200}).json()["data"]
                 if a["name"] == "S. Patel")
    booking = client.post("/api/v1/bookings", headers=admin_headers, json={
        "customer_id": approved_customer["id"], "plot_id": available_plot["id"], "final_price": available_plot["price"],
        "token_amount": "100000", "agent_code": agent["code"]})
    assert booking.status_code == 201, booking.text

    position = client.get(f"/api/v1/expenses/agent-payout/{agent['id']}", headers=admin_headers).json()["data"]
    assert position["agent_name"] == "S. Patel" and Decimal(position["net"]) > 0
    owed = Decimal(position["balance"])
    assert owed > 0
    before = summary(client, admin_headers)

    payout = {**EXPENSE, "category": "Agent payout", "description": "Commission payout", "amount": str(owed)}
    assert client.post("/api/v1/expenses", headers=admin_headers, json=payout).status_code == 409           # no agent chosen
    too_much = client.post("/api/v1/expenses", headers=admin_headers, json={**payout, "agent_id": agent["id"], "amount": str(owed + 1)})
    assert too_much.status_code == 409, too_much.text                                                        # more than is owed

    created = client.post("/api/v1/expenses", headers=admin_headers, json={**payout, "agent_id": agent["id"], "paid_to": None})
    assert created.status_code == 201, created.text
    row = created.json()["data"]
    assert row["agent_id"] == agent["id"] and row["agent_name"] == "S. Patel" and row["paid_to"] == "S. Patel"

    # The agent can see that they were paid, and was told so.
    seen = client.get("/api/v1/agents/payouts", headers=agent_headers).json()["data"]
    mine = [r for r in seen if r["id"] == row["id"]]
    assert len(mine) == 1 and Decimal(mine[0]["amount"]) == owed and mine[0]["mode"] == "Bank transfer"
    notices = client.get("/api/v1/notifications", headers=agent_headers, params={"page_size": 200}).json()["data"]
    assert any(n["title"] == "Commission payout received" for n in notices)

    after = summary(client, admin_headers)
    assert Decimal(after["expenses"]) == Decimal(before["expenses"])                      # not a second cost …
    assert Decimal(after["profit"]) == Decimal(before["profit"])                          # … so profit does not move
    assert Decimal(after["agent_payouts"]) - Decimal(before["agent_payouts"]) == owed

    again = client.get(f"/api/v1/expenses/agent-payout/{agent['id']}", headers=admin_headers).json()["data"]
    assert Decimal(again["balance"]) == 0 and Decimal(again["paid_out"]) >= owed
    assert client.post("/api/v1/expenses", headers=admin_headers, json={**payout, "agent_id": agent["id"], "amount": "1"}).status_code == 409

    # Other categories carry no agent, whatever was sent.
    other = client.post("/api/v1/expenses", headers=admin_headers, json={**EXPENSE, "agent_id": agent["id"]})
    assert other.status_code == 201 and other.json()["data"]["agent_id"] is None
