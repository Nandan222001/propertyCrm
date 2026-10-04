"""Input-validation tests: schemas, sanitisation and parameter whitelisting."""

from __future__ import annotations


def test_extra_fields_are_rejected(client, admin_headers):
    response = client.post(
        "/api/v1/projects",
        json={"name": "Injected Project", "is_admin": True, "role": "SUPER_ADMIN"},
        headers=admin_headers,
    )
    assert response.status_code == 422
    fields = {detail["field"] for detail in response.json()["error"]["details"]}
    assert {"is_admin", "role"} <= fields


def test_mobile_and_email_validation(client, admin_headers):
    response = client.post(
        "/api/v1/customers",
        json={
            "name": "Bad Contact",
            "email": "not-an-email",
            "phone": "12345",
        },
        headers=admin_headers,
    )
    assert response.status_code == 422
    fields = {detail["field"] for detail in response.json()["error"]["details"]}
    assert {"email", "phone"} <= fields


def test_money_must_be_non_negative(client, admin_headers):
    response = client.post(
        "/api/v1/projects",
        json={"name": "Negative Money", "estimated_revenue": "-500"},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_script_payloads_are_stripped_or_rejected(client, admin_headers):
    response = client.post(
        "/api/v1/projects",
        json={"name": "<script>alert('xss')</script>Green Valley", "city": "Pune"},
        headers=admin_headers,
    )
    if response.status_code == 201:
        assert "<script" not in response.json()["data"]["name"]
    else:
        assert response.status_code == 422


def test_pagination_bounds_are_enforced(client, admin_headers):
    assert client.get("/api/v1/plots?page=0", headers=admin_headers).status_code == 422
    assert client.get("/api/v1/plots?page_size=5000", headers=admin_headers).status_code == 422
    assert client.get("/api/v1/plots?page=1&page_size=200", headers=admin_headers).status_code == 200


def test_sort_field_whitelist_blocks_injection(client, admin_headers):
    response = client.get("/api/v1/plots?sort=id;DROP TABLE plots", headers=admin_headers)
    assert response.status_code in (200, 422)
    # The table must still exist whatever the outcome.
    assert client.get("/api/v1/plots", headers=admin_headers).status_code == 200


def test_search_term_length_is_capped(client, admin_headers):
    response = client.get(f"/api/v1/customers?search={'a' * 500}", headers=admin_headers)
    assert response.status_code == 422


def test_invalid_enum_values_are_rejected(client, admin_headers):
    response = client.post(
        "/api/v1/plots/1/status",
        json={"status": "NOT_A_REAL_STATUS"},
        headers=admin_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] in {"validation_error", "invalid_option"}


def test_unknown_route_returns_envelope_not_html(client, admin_headers):
    response = client.get("/api/v1/does-not-exist", headers=admin_headers)
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"]


def test_wrong_method_returns_envelope(client, admin_headers):
    response = client.patch("/api/v1/auth/login", json={}, headers=admin_headers)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"
