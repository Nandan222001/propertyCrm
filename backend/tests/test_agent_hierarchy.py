"""Agent hierarchy: one commission pool per branch, and a deal pays only the selling agent's own chain.

The top agent holds the pool (say 20%). Each agent under them is promised a slice of that pool: 14% to one agent
who keeps 6% of it on that branch and hands 8% to their own agent. A deal by the bottom agent therefore pays
8% + 6% + 6% = 20% — never more than the pool — and the parallel agents of the same upline earn nothing.
"""

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


def test_a_deal_pays_only_the_sellers_chain_and_never_more_than_the_pool(
        client, admin_headers, agent_headers, unique_phone, available_plot):
    first = _agent_named(client, admin_headers, "S. Patel")
    assert client.patch(f"/api/v1/agents/{first['id']}", headers=admin_headers,
                        json={"commission_rate": "0.20"}).status_code == 200

    # The pool holder promises 14% of their 20% to one agent; they hold 20% and keep 6% on that branch.
    email_b = f"{uuid.uuid4().hex[:8]}@example.demo"
    created = client.post("/api/v1/agents/team", headers=agent_headers, json={
        "name": "Second Agent", "email": email_b, "phone": unique_phone, "share": "0.14"})
    assert created.status_code == 201, created.text
    second = created.json()["data"]
    assert PCT(second["commission_rate"]) == 14 and second["parent_agent_id"] == first["id"]
    assert PCT(created.json()["data"]["parent_commission_rate"]) == 20
    assert PCT(_agent_named(client, admin_headers, "S. Patel")["commission_rate"]) == 20

    b_headers = _sign_in(client, email_b, "Second Agent", unique_phone)
    team_b = client.get("/api/v1/agents/team", headers=b_headers).json()["data"]
    assert PCT(team_b["me"]["commission_rate"]) == 14
    assert [m["name"] for m in team_b["members"]] == ["Second Agent"]
    assert team_b["members"][0]["deals"] == 0 and team_b["members"][0]["sales_value"] == "0"   # the My Team page columns
    # The admin sees every agent's team; an agent only their own branch.
    names_admin = {m["name"] for m in client.get("/api/v1/agents/team", headers=admin_headers).json()["data"]["members"]}
    assert {"S. Patel", "Second Agent"} <= names_admin
    assert "S. Patel" not in {m["name"] for m in team_b["members"]}

    # A parallel agent under the same pool holder — it must not earn on the other branch's deal.
    phone_d = "7" + unique_phone[1:][::-1]
    assert _add(client, admin_headers, "Parallel Agent", phone_d, "0.04",
                parent_agent_id=first["id"]).status_code == 201

    # The second agent hands 8% of their 14% to a third agent: on that branch they keep 6%.
    phone_c = "9" + unique_phone[1:][::-1]
    email_c = f"{uuid.uuid4().hex[:8]}@example.demo"
    third = client.post("/api/v1/agents/team", headers=b_headers, json={
        "name": "Third Agent", "email": email_c, "phone": phone_c, "share": "0.08"})
    assert third.status_code == 201, third.text
    assert PCT(third.json()["data"]["commission_rate"]) == 8
    # The second agent still holds 14%; on this branch they keep 6% (14 - 8), as the payout below shows.
    assert PCT(_agent_named(client, admin_headers, "Second Agent")["commission_rate"]) == 14

    # The third agent's deal: 8% + 6% + 6% = the 20% pool. The parallel agent is paid nothing.
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
        "Third Agent": 8000.0, "Second Agent": 6000.0, "S. Patel": 6000.0}
    assert "Parallel Agent" not in mine
    assert {k for k, v in mine.items() if v["is_override"]} == {"Second Agent", "S. Patel"}
    assert all(v["source_agent_name"] == "Third Agent" for v in mine.values())
    assert sum(float(v["rate"]) for v in mine.values()) <= 0.20 + 1e-9

    # Paying again accrues once per person on the selling chain, never twice.
    assert client.post("/api/v1/payments", headers=admin_headers, json={
        "booking_id": booking["id"], "amount": "50000", "mode": "UPI"}).status_code == 201
    rows = client.get("/api/v1/commissions", headers=admin_headers, params={"page_size": 200}).json()["data"]
    assert len([c for c in rows if c["booking_id"] == booking["id"]]) == 6

    # Sales pages: the seller sees the deal as a direct sale, the agents above them as a team sale.
    sales = lambda headers, kind: client.get("/api/v1/agents/sales", headers=headers, params={"kind": kind}).json()["data"]  # noqa: E731
    mine_direct = sales(c_headers, "direct")
    assert [r["booking_number"] for r in mine_direct] == [booking["booking_number"]]
    assert not mine_direct[0]["is_team"] and mine_direct[0]["customer"] == "Chain Customer"
    assert sales(c_headers, "team") == []
    for headers in (b_headers, agent_headers):
        assert booking["booking_number"] not in {r["booking_number"] for r in sales(headers, "direct")}
        team_sales = [r for r in sales(headers, "team") if r["booking_number"] == booking["booking_number"]]
        assert len(team_sales) == 1
        assert team_sales[0]["is_team"] and team_sales[0]["agent_name"] == "Third Agent"
        assert team_sales[0]["customer"] == "Chain Customer"   # the full name, as on the agent's own sales
        assert float(team_sales[0]["total"]) == float(available_plot["price"])
        pays = [r for r in client.get("/api/v1/agents/sales/payments", headers=headers).json()["data"]
                if r["booking_number"] == booking["booking_number"]]
        assert len(pays) == 2 and all(r["is_team"] for r in pays)
    own_pays = client.get("/api/v1/agents/sales/payments", headers=c_headers).json()["data"]
    assert len(own_pays) == 2 and not any(r["is_team"] for r in own_pays) and own_pays[0]["customer"] == "Chain Customer"

    # Each agent sees their own commission only (the override is the second agent's own row).
    for headers, expected in ((c_headers, {"Third Agent"}), (b_headers, {"Second Agent"}), (agent_headers, {"S. Patel"})):
        seen = client.get("/api/v1/commissions", headers=headers, params={"page_size": 200}).json()["data"]
        assert {c["agent_name"] for c in seen} == expected


def test_one_twenty_percent_pool_can_carry_four_parallel_agents(client, admin_headers, agent_headers, unique_phone):
    """20% pool with four agents on 10%, 12%, 14% and 16%: each is a slice of the one pool, not an addition."""
    assert client.patch(f"/api/v1/agents/{_agent_named(client, admin_headers, 'S. Patel')['id']}",
                        headers=admin_headers, json={"commission_rate": "0.20"}).status_code == 200
    for index, share in enumerate(("0.10", "0.12", "0.14", "0.16")):
        added = _add(client, agent_headers, f"Pool Agent {index}", unique_phone, share)
        assert added.status_code == 201, added.text
        assert PCT(added.json()["data"]["parent_commission_rate"]) == 20
    # The pool holder keeps their 20%: on each branch it keeps whatever it did not promise that branch.
    assert PCT(_agent_named(client, admin_headers, "S. Patel")["commission_rate"]) == 20
    team = client.get("/api/v1/agents/team", headers=agent_headers).json()["data"]
    assert sorted(PCT(m["commission_rate"]) for m in team["members"] if m["name"].startswith("Pool Agent")) == [
        10.0, 12.0, 14.0, 16.0]
    # But no single promise can swallow the pool: 20% down to one agent leaves the holder nothing.
    blocked = _add(client, agent_headers, "Pool Agent 5", unique_phone, "0.20")
    assert blocked.status_code in (409, 422) and "at least 1%" in blocked.text


def test_a_share_cannot_be_more_than_the_parent_holds(client, admin_headers, agent_headers, unique_phone):
    too_much = _add(client, agent_headers, "Greedy Agent", unique_phone, "0.25")
    assert too_much.status_code in (409, 422), too_much.text
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
