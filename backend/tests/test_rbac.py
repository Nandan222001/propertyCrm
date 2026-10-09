"""RBAC tests: the matrix, row-level scoping and privilege-escalation guards."""

from __future__ import annotations

import re

import pytest

from app.core.constants import ROLE_PERMISSIONS, Permission, Role
from app.core.permissions import has_permission, permissions_for, scope_for


def test_permission_matrix_is_declared_once_and_complete():
    """Every role has a policy and every permission belongs to someone."""
    for role in Role:
        assert role in ROLE_PERMISSIONS, f"{role} missing from the permission matrix"
    granted = {permission for permissions in ROLE_PERMISSIONS.values() for permission in permissions}
    assert granted == set(Permission), "matrix must cover the whole permission catalogue"


def test_super_admin_is_platform_only_and_admin_runs_the_organisation():
    # The platform owner manages tenants — and has no access to any tenant's data.
    platform = permissions_for(Role.SUPER_ADMIN)
    assert Permission.TENANT_MANAGE in platform and Permission.TENANT_VIEW in platform
    for business in (Permission.PROJECT_VIEW, Permission.BOOKING_VIEW_ALL, Permission.CUSTOMER_VIEW_ALL,
                     Permission.PAYMENT_VIEW_ALL, Permission.INVOICE_VIEW_ALL, Permission.PII_REVEAL):
        assert business not in platform
    # Tenant administration (audit, roles, erasure) belongs to the organisation's ADMIN.
    assert has_permission(Role.ADMIN, Permission.DATA_ERASURE)
    assert has_permission(Role.ADMIN, Permission.AUDIT_VIEW)
    assert not has_permission(Role.ADMIN, Permission.TENANT_MANAGE)
    assert not has_permission(Role.SALES_AGENT, Permission.BOOKING_APPROVE)
    assert not has_permission(Role.CUSTOMER, Permission.CUSTOMER_VIEW_ALL)


def test_scope_mapping():
    assert scope_for(Role.SALES_AGENT) == "own"
    assert scope_for(Role.CUSTOMER) == "self"
    assert scope_for(Role.ACCOUNTS) == "all"


def test_agents_cannot_list_all_customers(client, agent_headers):
    response = client.get("/api/v1/customers", headers=agent_headers)
    assert response.status_code in (200, 403)
    if response.status_code == 200:
        # Row-level scope: only the agent's own book is returned.
        for customer in response.json()["data"]:
            assert customer["agent_name"] in (None, "S. Patel")


def test_customer_portal_is_view_only(client, customer_headers):
    assert client.get("/api/v1/bookings", headers=customer_headers).status_code == 200
    blocked = client.post(
        "/api/v1/bookings",
        json={"customer_id": 1, "plot_id": 1, "final_price": "1000.00"},
        headers=customer_headers,
    )
    assert blocked.status_code == 403
    assert client.get("/api/v1/users", headers=customer_headers).status_code == 403
    assert client.get("/api/v1/audit-logs", headers=customer_headers).status_code == 403


@pytest.mark.parametrize(
    "path,method",
    [
        ("/api/v1/users", "get"),
        ("/api/v1/audit-logs", "get"),
        ("/api/v1/security-events", "get"),
        ("/api/v1/settings", "get"),
        ("/api/v1/commissions/payable", "get"),
    ],
)
def test_agent_is_denied_admin_surfaces(client, agent_headers, path, method):
    response = getattr(client, method)(path, headers=agent_headers)
    assert response.status_code == 403, f"{method.upper()} {path} must be denied for agents"


def test_accounts_cannot_approve_bookings(client, accounts_headers):
    response = client.post(
        "/api/v1/bookings/1/approve", json={"reason": "should not be allowed"}, headers=accounts_headers
    )
    assert response.status_code == 403


def test_admin_cannot_create_super_admin(client, admin_headers, unique_email):
    response = client.post(
        "/api/v1/users",
        json={
            "name": "Ascension Probe",
            "email": unique_email,
            "role": "SUPER_ADMIN",
            "temporary_password": "Strong@12345",
        },
        headers=admin_headers,
    )
    assert response.status_code == 403


def test_permission_grants_require_role_manage(client, admin_headers, accounts_headers, unique_email):
    created = client.post(
        "/api/v1/users",
        json={"name": "Grant Probe", "email": unique_email, "role": "ACCOUNTS",
              "temporary_password": "Strong@12345"},
        headers=admin_headers,
    )
    assert created.status_code == 201
    user_id = created.json()["data"]["id"]

    denied = client.put(
        f"/api/v1/users/{user_id}/permissions",
        json={"grants": [{"permission": "audit:view", "granted": True}]},
        headers=accounts_headers,
    )
    assert denied.status_code == 403

    granted = client.put(
        f"/api/v1/users/{user_id}/permissions",
        json={"grants": [{"permission": "audit:view", "granted": True}]},
        headers=admin_headers,
    )
    assert granted.status_code == 200
    assert any(item["permission"] == "audit:view" for item in granted.json()["data"])


def test_role_matrix_endpoint_matches_code(client, admin_headers):
    response = client.get("/api/v1/roles/matrix", headers=admin_headers)
    assert response.status_code == 200
    roles = {entry["role"]: entry for entry in response.json()["data"]["roles"]}
    assert set(roles) == {role.value for role in Role}
    assert "booking:approve" in roles["ADMIN"]["permissions"]
    assert "booking:approve" not in roles["SALES_AGENT"]["permissions"]


def test_every_business_route_rejects_anonymous_access(client):
    """Every non-public endpoint must refuse an unauthenticated request.

    This is the real protection check (not a dependency-count heuristic): we walk
    the route table FastAPI actually built and call each business endpoint with no
    credentials, expecting 401/403 — never a 2xx.
    """
    from app.routes.api_router import route_inventory

    inventory = route_inventory()
    # Guard against a vacuous pass: introspection must still see the whole API.
    assert len(inventory) >= 90, f"route inventory incomplete ({len(inventory)} routes)"

    business_routes = [route for route in inventory if not route["public"]]
    assert len(business_routes) >= 80, f"only {len(business_routes)} business routes found"

    leaked: list[tuple[str, str, int]] = []
    checked = 0
    for route in business_routes:
        resolved = re.sub(r"\{[^}]+\}", "1", "/api/v1" + route["path"])
        for method in route["methods"]:
            if method not in {"GET", "POST", "PATCH", "PUT", "DELETE"}:
                continue
            kwargs = {"json": {}} if method in {"POST", "PATCH", "PUT"} else {}
            response = client.request(method, resolved, **kwargs)
            checked += 1
            if response.status_code not in {401, 403}:
                leaked.append((method, resolved, response.status_code))

    assert checked >= 80, f"only {checked} endpoint calls exercised"
    assert not leaked, f"endpoints reachable without authentication: {leaked}"


def test_public_routes_are_exactly_health_and_auth():
    """Anything new that is anonymously reachable must be a deliberate decision."""
    from app.routes.api_router import route_inventory

    public_paths = {route["path"] for route in route_inventory() if route["public"]}
    unexpected = {
        path for path in public_paths
        if not (path.startswith("/auth/") or path in {"/health", "/ready", "/metrics"})
    }
    assert not unexpected, f"unexpected public endpoints: {sorted(unexpected)}"

