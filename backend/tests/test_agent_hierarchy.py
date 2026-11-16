"""Agent hierarchy: an agent hands part of their own commission rate to the agents they add."""

from __future__ import annotations

import uuid

from tests.conftest import starting_password
from tests.test_workflows import available_plot  # noqa: F401  (fixture)

PCT = lambda value: round(float(value) * 100, 2)  # noqa: E731


def _agent_named(client, headers, name):
    rows = client.get("/api/v1/agents", headers=headers, params={"page_size": 200}).json()["data"]
    return next(a for a in rows if a["name"] == name)


def _sign_in(client, email, name, phone):
    start = starting_password(name, phone)
    tokens = client.post("/api/v1/auth/login", json={"email": email, "password": start}).json()["data"]["tokens"]
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _add(client, headers, name, phone, share, **extra):
    return client.post("/api/v1/agents/team", headers=headers, json={
        "name": name, "email": f"{uuid.uuid4().hex[:8]}@example.demo", "phone": phone, "share": share, **extra})


def test_rate_moves_from_parent_to_new_agent_and_chain_shares_every_deal(
        client, admin_headers, agent_headers, unique_phone, available_plot):
    first = _agent_named(client, admin_headers, "S. Patel")
    assert client.patch(f"/api/v1/agents/{first['id']}", headers=admin_headers,
                        json={"commission_rate": "0.20"}).status_code == 200

    # First agent (20%) adds a second agent with 10% of it.
    email_b = f"{uuid.uuid4().hex[:8]}@example.demo"
    created = client.post("/api/v1/agents/team", headers=agent_headers, json={
        "name": "Second Agent", "email": email_b, "phone": unique_phone, "share": "0.10"})
    assert created.status_code == 201, created.text
    second = created.json()["data"]
    assert PCT(second["commission_rate"]) == 10 and second["parent_agent_id"] == first["id"]
    assert PCT(created.json()["data"]["parent_commission_rate"]) == 10
    assert PCT(_agent_named(client, admin_headers, "S. Patel")["commission_rate"]) == 10

    # The second agent signs in and sees 10% on their own team page; the first still sees theirs.
    b_headers = _sign_in(client, email_b, "Second Agent", unique_phone)
    team_b = client.get("/api/v1/agents/team", headers=b_headers).json()["data"]
    assert PCT(team_b["me"]["commission_rate"]) == 10
    assert [m["name"] for m in team_b["members"]] == ["Second Agent"]
    team_a = client.get("/api/v1/agents/team", headers=agent_headers).json()["data"]
    assert PCT(team_a["me"]["commission_rate"]) == 10
    assert {m["name"] for m in team_a["members"]} >= {"S. Patel", "Second Agent"}

    # The second agent adds a third with 4% of their 10%.
    phone_c = "9" + unique_phone[1:][::-1]
    email_c = f"{uuid.uuid4().hex[:8]}@example.demo"
    third = client.post("/api/v1/agents/team", headers=b_headers, json={
        "name": "Third Agent", "email": email_c, "phone": phone_c, "share": "0.04"})
    assert third.status_code == 201, third.text
    assert PCT(third.json()["data"]["commission_rate"]) == 4
    assert PCT(_agent_named(client, admin_headers, "Second Agent")["commission_rate"]) == 6

    # The third agent's deal: everyone on the chain earns their own rate; the total is the original 20%.
    c_headers = _sign_in(client, email_c, "Third Agent", phone_c)
    customer = client.post("/api/v1/customers", headers=c_headers, json={
        "name": "Chain Customer", "email": f"{uuid.uuid4().hex[:8]}@example.demo", "phone": "9" + unique_phone[1:],
        "city": "Pune", "pincode": "411001", "consent_given": True})
    assert customer.status_code == 201, customer.text
    customer = customer.json()["data"]
    assert client.post(f"/api/v1/customers/{customer['id']}/decision", headers=admin_headers,
                       json={"status": "APPROVED", "reason": "KYC"}).status_code == 200
    booking = client.post("/api/v1/bookings", headers=c_headers, json={
        "customer_id": customer["id"], "plot_id": available_plot["id"],
        "final_price": available_plot["price"], "token_amount": "100000"}).json()["data"]
    assert client.post(f"/api/v1/bookings/{booking['id']}/approve", headers=admin_headers,
                       json={"reason": "ok"}).status_code == 200

    rows = client.get("/api/v1/commissions", headers=admin_headers, params={"page_size": 200}).json()["data"]
    mine = {c["agent_name"]: c for c in rows if c["booking_id"] == booking["id"]}
    assert {k: float(v["gross_amount"]) for k, v in mine.items()} == {
        "Third Agent": 4000.0, "Second Agent": 6000.0, "S. Patel": 10000.0}
    assert [k for k, v in mine.items() if v["is_override"]] == ["Second Agent", "S. Patel"] or \
        {k for k, v in mine.items() if v["is_override"]} == {"Second Agent", "S. Patel"}
    assert all(v["source_agent_name"] == "Third Agent" for v in mine.values())
    # Paying again accrues once per person, never twice.
    assert client.post("/api/v1/payments", headers=admin_headers, json={
        "booking_id": booking["id"], "amount": "50000", "mode": "UPI"}).status_code == 201
    rows = client.get("/api/v1/commissions", headers=admin_headers, params={"page_size": 200}).json()["data"]
    assert len([c for c in rows if c["booking_id"] == booking["id"]]) == 6

    # Each agent sees their own commission only (the override is the second agent's own row).
    for headers, expected in ((c_headers, {"Third Agent"}), (b_headers, {"Second Agent"}), (agent_headers, {"S. Patel"})):
        seen = client.get("/api/v1/commissions", headers=headers, params={"page_size": 200}).json()["data"]
        assert {c["agent_name"] for c in seen} == expected


def test_new_agent_cannot_be_given_more_than_the_parent_has(client, admin_headers, agent_headers, unique_phone):
    me = _agent_named(client, admin_headers, "S. Patel")
    have = float(me["commission_rate"])
    too_much = _add(client, agent_headers, "Greedy Agent", unique_phone, str(min(have, 0.25)))
    assert too_much.status_code in (409, 422), too_much.text
    assert PCT(_agent_named(client, admin_headers, "S. Patel")["commission_rate"]) == PCT(have)
    assert _add(client, agent_headers, "Zero Agent", unique_phone, "0").status_code == 422


def test_only_the_owner_or_admin_can_add_agents_to_a_team(client, admin_headers, agent_headers,
                                                          accounts_headers, unique_phone):
    other = next(a for a in client.get("/api/v1/agents", headers=admin_headers, params={"page_size": 200}).json()["data"]
                 if a["name"] != "S. Patel")
    assert _add(client, agent_headers, "Hijack Agent", unique_phone, "0.001",
                parent_agent_id=other["id"]).status_code == 403
    assert _add(client, accounts_headers, "Accounts Agent", unique_phone, "0.001").status_code == 403
    assert _add(client, admin_headers, "No Parent Agent", unique_phone, "0.001").status_code == 409
    ok = _add(client, admin_headers, "Admin Placed Agent", unique_phone, "0.001", parent_agent_id=other["id"])
    assert ok.status_code == 201, ok.text
    assert ok.json()["data"]["parent_agent_id"] == other["id"]
