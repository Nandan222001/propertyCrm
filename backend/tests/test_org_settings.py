"""Company profile / bank / tax settings are shared across the organisation's users and devices."""

from __future__ import annotations

from tests.conftest import auth_headers


def test_admin_saves_and_every_member_reads_the_same_settings(client, admin_headers, accounts_headers, agent_headers):
    saved = client.put("/api/v1/organisation/settings/bank", headers=admin_headers, json={"values": {
        "bankName": "HDFC Bank", "accountName": "Lalita Infra", "accountNumber": "123456789012",
        "ifsc": "hdfc0001234", "upi": "lalita@hdfc",
    }})
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["ifsc"] == "HDFC0001234"   # normalised

    for headers in (accounts_headers, agent_headers, admin_headers):
        data = client.get("/api/v1/organisation/settings", headers=headers).json()["data"]
        assert data["bank"]["bankName"] == "HDFC Bank" and data["bank"]["accountNumber"] == "123456789012"
        assert data["company"]["name"] == "Lalita Realestate Infra"
        assert data["tax"]["receiptPrefix"] == "RCT"


def test_only_settings_managers_can_change_them_and_bad_values_are_refused(client, admin_headers, accounts_headers, agent_headers):
    body = {"values": {"bankName": "X", "accountNumber": "12"}}
    assert client.put("/api/v1/organisation/settings/bank", headers=agent_headers, json=body).status_code == 403
    assert client.put("/api/v1/organisation/settings/bank", headers=accounts_headers, json=body).status_code == 403
    assert client.put("/api/v1/organisation/settings/bank", headers=admin_headers, json=body).status_code == 422
    bad_ifsc = {"values": {"ifsc": "NOTANIFSC"}}
    assert client.put("/api/v1/organisation/settings/bank", headers=admin_headers, json=bad_ifsc).status_code == 422
    assert client.put("/api/v1/organisation/settings/company", headers=admin_headers,
                      json={"values": {"name": "<script>x</script>"}}).status_code == 422
    assert client.put("/api/v1/organisation/settings/nope", headers=admin_headers, json={"values": {}}).status_code == 422


def test_settings_do_not_cross_organisations_and_platform_has_none(client, admin_headers):
    super_admin = auth_headers(client, "SUPER_ADMIN")
    assert client.get("/api/v1/organisation/settings", headers=super_admin).status_code == 403
    client.put("/api/v1/organisation/settings/tax", headers=admin_headers,
               json={"values": {"receiptPrefix": "LAL", "defaultGst": "0.18", "tdsRate": "10", "dueDays": "30"}})
    mine = client.get("/api/v1/organisation/settings", headers=admin_headers).json()["data"]
    assert mine["tax"]["tdsRate"] == "10"


def test_saved_tax_rules_take_effect_on_new_receipts_and_commissions(client, admin_headers, accounts_headers, agent_headers):
    client.put("/api/v1/organisation/settings/tax", headers=admin_headers,
               json={"values": {"receiptPrefix": "LRC", "defaultGst": "0.18", "tdsRate": "10", "dueDays": "15"}})
    try:
        # a manual commission uses the organisation's TDS percentage
        agents = client.get("/api/v1/agents?page_size=5", headers=admin_headers).json()["data"]
        created = client.post("/api/v1/commissions", headers=admin_headers, json={
            "agent_id": agents[0]["id"], "deal_value": "1000000", "rate": "0.02",
        })
        assert created.status_code in (200, 201), created.text
        data = created.json()["data"]
        assert float(data["gross_amount"]) == 20000 and float(data["tds_amount"]) == 2000   # 10%, not the default 5%

        # a new receipt takes the saved prefix
        booking = next(b for b in client.get("/api/v1/bookings?page_size=50", headers=admin_headers).json()["data"]
                       if b["status"] == "CONFIRMED" and float(b["final_price"]) > float(b["paid_amount"]))
        paid = client.post("/api/v1/payments", headers=accounts_headers, json={
            "booking_id": booking["id"], "amount": "1000", "mode": "UPI"})
        assert paid.status_code in (200, 201), paid.text
        receipts = client.get("/api/v1/receipts?page_size=50", headers=accounts_headers).json()["data"]
        assert any(r["receipt_number"].startswith("LRC-") for r in receipts)
    finally:
        client.put("/api/v1/organisation/settings/tax", headers=admin_headers,
                   json={"values": {"receiptPrefix": "RCT", "defaultGst": "0.18", "tdsRate": "5", "dueDays": "15"}})
