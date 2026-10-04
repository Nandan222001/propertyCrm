"""Aggregate v1 router: one place to see (and gate) the whole API surface.

Public routes (docs/health/auth) are grouped separately from everything else so a
future audit can prove that no business endpoint is reachable anonymously.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routes.agent_routes import router as agent_router
from app.routes.audit_routes import router as audit_router
from app.routes.auth_routes import router as auth_router
from app.routes.booking_routes import router as booking_router
from app.routes.commission_routes import router as commission_router
from app.routes.customer_routes import router as customer_router
from app.routes.dashboard_routes import router as dashboard_router
from app.routes.health_routes import router as health_router
from app.routes.notification_routes import router as notification_router
from app.routes.payment_routes import router as payment_router
from app.routes.property_routes import router as property_router
from app.routes.report_routes import router as report_router
from app.routes.user_routes import router as user_router

#: Endpoints that intentionally do not require a token.
PUBLIC_PATHS = (
    "/health",
    "/ready",
    "/metrics",
)

api_router = APIRouter()

# Operations first: probes must stay reachable during partial outages.
api_router.include_router(health_router)

# Authentication: public, but strictly rate limited.
api_router.include_router(auth_router)

# Everything below requires a valid access token (route-level dependencies).
for router in (
    user_router,
    property_router,
    customer_router,
    booking_router,
    payment_router,
    agent_router,
    commission_router,
    notification_router,
    report_router,
    dashboard_router,
    audit_router,
):
    api_router.include_router(router)


def _iter_api_routes(routes):
    """Yield every concrete route, descending into lazily-included routers.

    FastAPI >= 0.142 keeps `include_router` results as `_IncludedRouter` objects
    (the sub-router is resolved when the app builds its route table), so a plain
    iteration over `router.routes` no longer sees the endpoints.
    """
    for route in routes:
        sub_router = getattr(route, "original_router", None) or getattr(route, "router", None)
        if sub_router is not None and getattr(sub_router, "routes", None) is not None:
            yield from _iter_api_routes(sub_router.routes)
        else:
            yield route


def route_inventory() -> list[dict]:
    """Introspection helper used by tests to assert every route is protected.

    Only the versioned API surface is listed — the framework's own docs/openapi
    routes are not business endpoints. Paths are relative to the API prefix.
    """
    inventory: list[dict] = []
    for route in _iter_api_routes(api_router.routes):
        path = getattr(route, "path", "") or ""
        methods = sorted(getattr(route, "methods", []) or [])
        dependencies = getattr(route, "dependencies", []) or []
        if not path or not methods:
            continue  # mounts and websockets are not HTTP endpoints
        inventory.append(
            {
                "path": path,
                "methods": methods,
                "public": any(path.startswith(public) for public in PUBLIC_PATHS)
                or path.startswith("/auth/"),
                "dependency_count": len(dependencies),
            }
        )
    return inventory
