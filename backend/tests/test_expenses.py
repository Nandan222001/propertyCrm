"""Company expenses and the profit-till-date figure."""

from __future__ import annotations

from datetime import date, timedelta
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
