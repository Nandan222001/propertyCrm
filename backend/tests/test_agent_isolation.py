"""An agent sees only their own work; customers only their own; oversight roles see all."""

from __future__ import annotations


def _rows(client, path, headers):
    response = client.get(f"{path}?page_size=200", headers=headers)
    assert response.status_code == 200, (path, response.text)
    return response.json()["data"]


def _me(client, headers) -> dict:
    data = client.get("/api/v1/auth/me", headers=headers).json()["data"]
    return data.get("user", data)


def _my_agent_id(client, agent_headers) -> int:
    rows = _rows(client, "/api/v1/agents", agent_headers)
    assert len(rows) == 1, "an agent must only ever see their own agent record"
    return rows[0]["id"]


def test_agent_lists_contain_only_their_own_records(client, admin_headers, agent_headers):
    mine = _my_agent_id(client, agent_headers)
    for path in ("/api/v1/bookings", "/api/v1/customers", "/api/v1/commissions"):
        for row in _rows(client, path, agent_headers):
            assert row.get("agent_id") == mine, (path, row)
    # and there really is other agents' data for the check to bite on
    assert len(_rows(client, "/api/v1/bookings", admin_headers)) > len(_rows(client, "/api/v1/bookings", agent_headers))


def test_agent_cannot_open_another_agents_records_by_id(client, admin_headers, agent_headers):
    mine_b = {b["id"] for b in _rows(client, "/api/v1/bookings", agent_headers)}
    mine_c = {c["id"] for c in _rows(client, "/api/v1/customers", agent_headers)}
    for booking in _rows(client, "/api/v1/bookings", admin_headers):
        if booking["id"] not in mine_b:
            assert client.get(f"/api/v1/bookings/{booking['id']}", headers=agent_headers).status_code == 403
    for customer in _rows(client, "/api/v1/customers", admin_headers):
        if customer["id"] not in mine_c:
            assert client.get(f"/api/v1/customers/{customer['id']}", headers=agent_headers).status_code == 403


def test_agent_cannot_see_other_agents_sales_or_rates(client, admin_headers, agent_headers):
    mine = _my_agent_id(client, agent_headers)
    board = _rows(client, "/api/v1/agents/leaderboard", agent_headers)
    assert [r["id"] for r in board] == [mine]
    others = [a for a in _rows(client, "/api/v1/agents", admin_headers) if a["id"] != mine]
    assert others
    other = others[0]
    assert client.get(f"/api/v1/agents/performance?agent_id={other['id']}", headers=agent_headers).status_code == 403
    found = client.get(f"/api/v1/agents/lookup?q={other['code']}", headers=agent_headers).json()["data"]
    assert found == []
    assert client.patch(f"/api/v1/agents/{other['id']}", headers=agent_headers,
                        json={"commission_rate": "0.25"}).status_code == 403


def test_agent_documents_belong_to_their_customers_only(client, agent_headers):
    mine_c = {c["id"] for c in _rows(client, "/api/v1/customers", agent_headers)}
    for document in _rows(client, "/api/v1/documents", agent_headers):
        assert document["customer_id"] in mine_c, document


def test_plots_do_not_reveal_other_agents_or_customers(client, agent_headers):
    mine = _my_agent_id(client, agent_headers)
    mine_c = {c["id"] for c in _rows(client, "/api/v1/customers", agent_headers)}
    for plot in _rows(client, "/api/v1/plots", agent_headers):
        assert plot["agent_id"] in (None, mine), plot
        assert plot["customer_id"] is None or plot["customer_id"] in mine_c, plot


def test_customer_sees_only_own_documents_and_bookings(client, customer_headers):
    me = _me(client, customer_headers)
    for booking in _rows(client, "/api/v1/bookings", customer_headers):
        assert booking["customer_id"] == me["customer_id"]
    for document in _rows(client, "/api/v1/documents", customer_headers):
        assert document["customer_id"] == me["customer_id"]
        assert document["is_shared_with_customer"] is True
    assert _rows(client, "/api/v1/agents", customer_headers) == []


def test_management_role_no_longer_exists(client):
    from app.core.constants import Role

    assert "MANAGEMENT" not in {r.value for r in Role}
    tokens = client.post("/api/v1/auth/login", json={"email": "management@nmtsolution.demo", "password": "Demo@12345"})
    assert tokens.status_code in (401, 403, 422)
    from tests.conftest import auth_headers

    admin = auth_headers(client, "ADMIN")
    created = client.post("/api/v1/users", headers=admin, json={
        "name": "Board Member", "email": "board@nmtsolution.demo", "role": "MANAGEMENT",
        "phone": "9876500004",
    })
    assert created.status_code in (400, 422)
