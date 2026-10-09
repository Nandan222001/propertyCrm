"""Multi-tenancy: isolation, platform-only super admin, tenant lifecycle."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select

from app.db.session import session_scope
from app.db.tenancy import TenantIsolationError, set_scope
from app.models.customer import Customer
from app.models.property import Plot, Project
from app.models.tenant import Tenant
from tests.conftest import DEMO_PASSWORD, auth_headers

STRONG = "Tenant@12345"


# --------------------------------------------------------------------- helpers
@pytest.fixture()
def platform_headers(client) -> dict[str, str]:
    return auth_headers(client, "SUPER_ADMIN")


def _login(client, email: str, password: str = STRONG) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['data']['tokens']['access_token']}"}


def _new_tenant(client, platform_headers, *, max_users: int = 25, name: str | None = None) -> dict:
    token = uuid.uuid4().hex[:8]
    body = {
        "name": name or f"Org {token}",
        "plan": "STANDARD",
        "max_users": max_users,
        "admin": {"name": "Org Admin", "email": f"admin-{token}@org.demo", "temporary_password": STRONG},
    }
    response = client.post("/api/v1/tenants", json=body, headers=platform_headers)
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    data["admin_email"] = body["admin"]["email"]
    return data


@pytest.fixture()
def tenant_a(client, platform_headers) -> dict:
    created = _new_tenant(client, platform_headers)
    created["headers"] = _login(client, created["admin_email"])
    return created


@pytest.fixture()
def tenant_b(client, platform_headers) -> dict:
    created = _new_tenant(client, platform_headers)
    created["headers"] = _login(client, created["admin_email"])
    return created


def _project(client, headers, name: str) -> dict:
    response = client.post("/api/v1/projects", json={"name": name, "total_plots": 5}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["data"]


# --------------------------------------------------------- platform super admin
def test_super_admin_cannot_read_any_tenant_business_data(client, platform_headers):
    for path in ("/projects", "/plots", "/customers", "/bookings", "/payments", "/invoices", "/agents"):
        assert client.get(f"/api/v1{path}", headers=platform_headers).status_code == 403, path


def test_only_the_platform_can_manage_tenants(client, platform_headers, admin_headers, agent_headers):
    assert client.get("/api/v1/tenants", headers=platform_headers).status_code == 200
    for headers in (admin_headers, agent_headers):
        assert client.get("/api/v1/tenants", headers=headers).status_code == 403
        assert client.post("/api/v1/tenants", json={}, headers=headers).status_code == 403
        assert client.get("/api/v1/platform/overview", headers=headers).status_code == 403


def test_me_reports_tenant_for_staff_and_platform_flag_for_super_admin(client, admin_headers, platform_headers):
    staff = client.get("/api/v1/auth/me", headers=admin_headers).json()["data"]["user"]
    assert staff["tenant_slug"] == "lalita" and staff["is_platform"] is False
    platform = client.get("/api/v1/auth/me", headers=platform_headers).json()["data"]["user"]
    assert platform["tenant_id"] is None and platform["is_platform"] is True


# ------------------------------------------------------------- tenant lifecycle
def test_create_tenant_provisions_a_working_isolated_workspace(client, platform_headers):
    response = client.post(
        "/api/v1/tenants",
        json={"name": "Fresh Realty", "admin": {"name": "Fresh Admin", "email": f"fresh-{uuid.uuid4().hex[:6]}@org.demo"}},
        headers=platform_headers,
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["tenant"]["slug"] == "fresh-realty" and data["tenant"]["status"] == "ACTIVE"
    password = data["initial_password"]
    assert password, "a generated one-time password is returned exactly once"

    headers = _login(client, data["admin"]["email"], password)
    # brand-new workspace: nothing from any other tenant is visible
    for path in ("/projects", "/customers", "/bookings", "/plots"):
        assert client.get(f"/api/v1{path}", headers=headers).json()["data"] == [], path
    me = client.get("/api/v1/auth/me", headers=headers).json()["data"]["user"]
    assert me["tenant_name"] == "Fresh Realty" and me["role"] == "ADMIN"


def test_tenant_detail_and_overview_include_usage(client, platform_headers, tenant_a):
    _project(client, tenant_a["headers"], "Usage Project")
    detail = client.get(f"/api/v1/tenants/{tenant_a['tenant']['id']}", headers=platform_headers).json()["data"]
    assert detail["usage"]["projects"] == 1 and detail["usage"]["users"] == 1
    assert [a["email"] for a in detail["admins"]] == [tenant_a["admin_email"]]
    listed = client.get("/api/v1/tenants?page_size=200", headers=platform_headers).json()["data"]
    mine = next(t for t in listed if t["id"] == tenant_a["tenant"]["id"])
    assert mine["primary_admin_email"] == tenant_a["admin_email"], "list shows the tenant's own admin"
    overview = client.get("/api/v1/platform/overview", headers=platform_headers).json()["data"]
    assert overview["tenants"] >= 3 and overview["active"] >= 3 and overview["users"] >= 1


def test_duplicate_slug_and_duplicate_admin_email_are_rejected(client, platform_headers, tenant_a):
    dup_slug = client.post("/api/v1/tenants", headers=platform_headers, json={
        "name": "Other", "slug": tenant_a["tenant"]["slug"],
        "admin": {"name": "X Admin", "email": f"x-{uuid.uuid4().hex[:6]}@org.demo"}})
    assert dup_slug.status_code == 409
    dup_email = client.post("/api/v1/tenants", headers=platform_headers, json={
        "name": "Another Org", "admin": {"name": "X Admin", "email": tenant_a["admin_email"]}})
    assert dup_email.status_code == 409


def test_update_tenant_and_seat_limit_guard(client, platform_headers, tenant_a):
    tid = tenant_a["tenant"]["id"]
    updated = client.patch(f"/api/v1/tenants/{tid}", json={"plan": "ENTERPRISE", "max_users": 50}, headers=platform_headers)
    assert updated.status_code == 200 and updated.json()["data"]["plan"] == "ENTERPRISE"
    added = client.post("/api/v1/users", headers=tenant_a["headers"], json={
        "name": "Seat Two", "email": f"seat-{uuid.uuid4().hex[:6]}@org.demo",
        "role": "SALES_AGENT", "temporary_password": STRONG})
    assert added.status_code == 201, added.text
    refused = client.patch(f"/api/v1/tenants/{tid}", json={"max_users": 1}, headers=platform_headers)
    assert refused.status_code == 409, "cannot shrink below the 2 seats already used"
    exact = client.patch(f"/api/v1/tenants/{tid}", json={"max_users": 2}, headers=platform_headers)
    assert exact.status_code == 200


def test_seat_limit_blocks_new_users(client, platform_headers):
    tenant = _new_tenant(client, platform_headers, max_users=1)
    headers = _login(client, tenant["admin_email"])
    response = client.post("/api/v1/users", headers=headers, json={
        "name": "One Too Many", "email": f"many-{uuid.uuid4().hex[:6]}@org.demo",
        "role": "SALES_AGENT", "temporary_password": STRONG})
    assert response.status_code == 409 and "allows 1 users" in response.text


def test_suspending_a_tenant_locks_everyone_out_immediately(client, platform_headers, tenant_a):
    tid = tenant_a["tenant"]["id"]
    headers = tenant_a["headers"]
    assert client.get("/api/v1/projects", headers=headers).status_code == 200

    suspended = client.post(f"/api/v1/tenants/{tid}/suspend", json={"reason": "Invoice unpaid"}, headers=platform_headers)
    assert suspended.status_code == 200 and suspended.json()["data"]["status"] == "SUSPENDED"

    # the token issued *before* suspension is rejected on the very next request
    assert client.get("/api/v1/projects", headers=headers).status_code == 403
    # new sign-ins are refused with a clear reason
    login = client.post("/api/v1/auth/login", json={"email": tenant_a["admin_email"], "password": STRONG})
    assert login.status_code == 401 and "suspended" in login.text.lower()

    again = client.post(f"/api/v1/tenants/{tid}/suspend", json={"reason": "again"}, headers=platform_headers)
    assert again.status_code == 409

    reactivated = client.post(f"/api/v1/tenants/{tid}/activate", headers=platform_headers)
    assert reactivated.status_code == 200
    assert client.get("/api/v1/projects", headers=_login(client, tenant_a["admin_email"])).status_code == 200


def test_add_admin_and_reset_password(client, platform_headers, tenant_a):
    tid = tenant_a["tenant"]["id"]
    email = f"second-{uuid.uuid4().hex[:6]}@org.demo"
    added = client.post(f"/api/v1/tenants/{tid}/admins", headers=platform_headers,
                        json={"name": "Second Admin", "email": email})
    assert added.status_code == 201
    one_time = added.json()["data"]["initial_password"]
    assert client.get("/api/v1/projects", headers=_login(client, email, one_time)).status_code == 200

    reset = client.post(f"/api/v1/tenants/{tid}/admins/{added.json()['data']['admin']['id']}/reset-password",
                        headers=platform_headers)
    assert reset.status_code == 200 and reset.json()["data"]["initial_password"] != one_time


# -------------------------------------------------------------------- isolation
def test_tenants_only_ever_see_their_own_rows(client, tenant_a, tenant_b, admin_headers):
    mine = _project(client, tenant_a["headers"], "Alpha Heights")
    names_a = {p["name"] for p in client.get("/api/v1/projects", headers=tenant_a["headers"]).json()["data"]}
    names_b = {p["name"] for p in client.get("/api/v1/projects", headers=tenant_b["headers"]).json()["data"]}
    names_default = {p["name"] for p in client.get("/api/v1/projects", headers=admin_headers).json()["data"]}
    assert names_a == {"Alpha Heights"} and names_b == set()
    assert "Alpha Heights" not in names_default and "Green Meadows" in names_default

    # an id that exists — but in another tenant — is simply not found (no existence oracle)
    pid = mine["id"]
    for headers in (tenant_b["headers"], admin_headers):
        assert client.patch(f"/api/v1/projects/{pid}", json={"name": "Hijacked"}, headers=headers).status_code == 404
        assert client.delete(f"/api/v1/projects/{pid}", headers=headers).status_code == 404
    still = client.get("/api/v1/projects", headers=tenant_a["headers"]).json()["data"]
    assert [p["name"] for p in still] == ["Alpha Heights"]


def test_seeded_second_tenant_is_invisible_to_the_default_tenant(client, admin_headers):
    skyline = auth_headers_for(client, "admin@skyline.demo")
    sky_names = {p["name"] for p in client.get("/api/v1/projects", headers=skyline).json()["data"]}
    default_names = {p["name"] for p in client.get("/api/v1/projects", headers=admin_headers).json()["data"]}
    assert sky_names == {"Skyline Heights"}
    assert "Skyline Heights" not in default_names and not (sky_names & default_names)


def auth_headers_for(client, email: str) -> dict[str, str]:
    return _login(client, email, DEMO_PASSWORD)


def test_same_project_name_is_allowed_in_different_tenants_but_not_twice_in_one(client, tenant_a, admin_headers):
    # "Green Meadows" already exists in the default tenant
    assert client.post("/api/v1/projects", json={"name": "Green Meadows", "total_plots": 3},
                       headers=tenant_a["headers"]).status_code == 201
    assert client.post("/api/v1/projects", json={"name": "Green Meadows", "total_plots": 3},
                       headers=tenant_a["headers"]).status_code == 409


def test_business_numbers_restart_per_tenant(client, tenant_a):
    headers = tenant_a["headers"]
    project = _project(client, headers, "Numbering Project")
    plot = client.post("/api/v1/plots", headers=headers, json={
        "plot_number": "N-001", "project_id": project["id"], "layout": "L", "area_sqft": "1000",
        "facing": "East", "price": "1000000", "status": "AVAILABLE"}).json()["data"]
    customer = client.post("/api/v1/customers", headers=headers, json={
        "name": "Numbering Customer", "email": f"num-{uuid.uuid4().hex[:6]}@example.demo",
        "phone": "9876543210", "city": "Pune", "pincode": "411001", "consent_given": True}).json()["data"]
    client.post(f"/api/v1/customers/{customer['id']}/decision", headers=headers,
                json={"status": "APPROVED", "reason": "ok"})
    booking = client.post("/api/v1/bookings", headers=headers, json={
        "customer_id": customer["id"], "plot_id": plot["id"], "final_price": "1000000"})
    assert booking.status_code == 201, booking.text
    # the default tenant is already far past 0001; a new tenant starts its own sequence
    assert booking.json()["data"]["booking_number"].endswith("-0001")


def test_cross_tenant_references_are_refused(client, tenant_a, tenant_b):
    plot_in_a = None
    project = _project(client, tenant_a["headers"], "A Only")
    plot_in_a = client.post("/api/v1/plots", headers=tenant_a["headers"], json={
        "plot_number": "X-1", "project_id": project["id"], "area_sqft": "1000", "price": "100000"}).json()["data"]
    customer_b = client.post("/api/v1/customers", headers=tenant_b["headers"], json={
        "name": "B Customer", "email": f"b-{uuid.uuid4().hex[:6]}@example.demo", "phone": "9876543211",
        "city": "Pune", "pincode": "411001", "consent_given": True}).json()["data"]
    # tenant B cannot book tenant A's plot, nor create a plot inside A's project
    assert client.post("/api/v1/bookings", headers=tenant_b["headers"], json={
        "customer_id": customer_b["id"], "plot_id": plot_in_a["id"], "final_price": "100000"}).status_code == 404
    assert client.post("/api/v1/plots", headers=tenant_b["headers"], json={
        "plot_number": "X-2", "project_id": project["id"], "area_sqft": "1000", "price": "100000"}).status_code == 404


def test_new_rows_are_stamped_with_the_callers_tenant(client, tenant_a):
    created = client.post("/api/v1/customers", headers=tenant_a["headers"], json={
        "name": "Stamped Customer", "email": f"stamp-{uuid.uuid4().hex[:6]}@example.demo",
        "phone": "9876543212", "city": "Pune", "pincode": "411001", "consent_given": True})
    assert created.status_code == 201
    with session_scope() as db:  # unscoped: sees everything
        row = db.execute(select(Customer).where(Customer.id == created.json()["data"]["id"])).scalar_one()
        assert row.tenant_id == tenant_a["tenant"]["id"]


def test_users_are_isolated_and_tenant_staff_cannot_mint_platform_accounts(client, tenant_a, tenant_b):
    email = f"staff-{uuid.uuid4().hex[:6]}@org.demo"
    made = client.post("/api/v1/users", headers=tenant_a["headers"], json={
        "name": "A Staff", "email": email, "role": "ACCOUNTS", "temporary_password": STRONG})
    assert made.status_code == 201
    emails_b = {u["email"] for u in client.get("/api/v1/users", headers=tenant_b["headers"]).json()["data"]}
    assert email not in emails_b and tenant_a["admin_email"] not in emails_b
    # an e-mail identifies one account platform-wide
    assert client.post("/api/v1/users", headers=tenant_b["headers"], json={
        "name": "Dup", "email": email, "role": "ACCOUNTS", "temporary_password": STRONG}).status_code == 409
    platform = client.post("/api/v1/users", headers=tenant_a["headers"], json={
        "name": "Mallory", "email": f"m-{uuid.uuid4().hex[:6]}@org.demo", "role": "SUPER_ADMIN",
        "temporary_password": STRONG})
    assert platform.status_code == 403


def test_audit_trails_are_separated(client, platform_headers, tenant_a):
    _project(client, tenant_a["headers"], "Audited")
    tenant_logs = client.get("/api/v1/audit-logs?page_size=100", headers=tenant_a["headers"]).json()["data"]
    platform_logs = client.get("/api/v1/audit-logs?page_size=100", headers=platform_headers).json()["data"]
    assert all(not log["action"].startswith("platform.") for log in tenant_logs)
    assert any(log["action"] == "platform.tenant_created" for log in platform_logs)
    assert not any(log["resource"] == "project" for log in platform_logs), "platform never sees tenant records"


def test_registration_requires_a_valid_active_tenant(client, unique_email):
    body = {"name": "Self Reg", "email": unique_email, "password": "Strong@12345",
            "confirm_password": "Strong@12345", "role": "CUSTOMER", "consent": True}
    assert client.post("/api/v1/auth/register", json={**body, "tenant": "no-such-org"}).status_code in (400, 422)
    assert client.post("/api/v1/auth/register", json=body).status_code == 422  # tenant is required
    ok = client.post("/api/v1/auth/register", json={**body, "tenant": "lalita"})
    assert ok.status_code == 201 and ok.json()["data"]["user"]["tenant_slug"] == "lalita"


# ------------------------------------------------- the filter itself (unit level)
def test_orm_filter_scopes_selects_aggregates_joins_and_blocks_foreign_writes():
    with session_scope() as db:
        default_id = db.execute(select(Tenant.id).where(Tenant.slug == "lalita")).scalar_one()
        skyline_id = db.execute(select(Tenant.id).where(Tenant.slug == "skyline")).scalar_one()
        default_projects = db.execute(
            select(func.count(Project.id)).where(Project.tenant_id == default_id)
            .execution_options(all_tenants=True)
        ).scalar_one()

        set_scope(db, skyline_id)
        assert db.query(Project).count() == 1                                   # ORM query
        assert db.execute(select(func.count(Project.id))).scalar_one() == 1      # aggregate
        assert db.execute(select(func.count()).select_from(select(Project.id).subquery())).scalar_one() == 1
        joined = db.execute(select(func.count(Plot.id)).join(Project, Plot.project_id == Project.id)).scalar_one()
        assert joined == 3                                                       # join stays inside the tenant
        assert db.query(Project).filter(Project.name == "Green Meadows").first() is None

        set_scope(db, default_id)
        assert db.query(Project).count() == default_projects

        # a write for a different tenant is refused before it reaches the database
        db.add(Project(name="Smuggled", total_plots=1, tenant_id=skyline_id))
        with pytest.raises(TenantIsolationError):
            db.flush()
        db.rollback()
