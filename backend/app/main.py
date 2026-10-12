"""FastAPI application factory.

Start-up order matters and is deliberate:

1. configuration validation (fails fast on missing production secrets);
2. structured logging + redaction;
3. middleware stack (request id → security headers → HTTPS → body size → rate limit);
4. trusted hosts + explicit CORS allowlist;
5. routers with a decorated OpenAPI schema (envelope + error models documented);
6. lifecycle hooks: DB connectivity check, schema bootstrap in local/test.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import (
    BodySizeLimitMiddleware,
    HTTPSRedirectMiddleware,
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.routes.api_router import api_router

logger = get_logger(__name__)


def _openapi_tags() -> list[dict]:
    return [
        {"name": "Operations", "description": "Health, readiness and metrics probes."},
        {"name": "Authentication", "description": "Sign-in, token rotation, password flows."},
        {"name": "Identity & RBAC", "description": "User provisioning, roles and permission overrides."},
        {"name": "Inventory", "description": "Projects, plots, inventory summaries and the document vault."},
        {"name": "Customers", "description": "Customer master data, approvals and privacy operations."},
        {"name": "Bookings", "description": "Booking workflow with maker/checker approval."},
        {"name": "Collections", "description": "Payments, ledger, receipts and overdue management."},
        {"name": "Billing", "description": "Tax invoices, line items, GST, PDF bills, settlement."},
        {"name": "Agents", "description": "Agent roster and performance."},
        {"name": "Commissions", "description": "Commission accrual, approval and payout."},
        {"name": "Reports", "description": "Business intelligence reports."},
        {"name": "Dashboard", "description": "Role-aware KPI dashboards."},
        {"name": "Notifications", "description": "Follow-up queues and alerts."},
        {"name": "Governance", "description": "Audit trail, security events and runtime settings."},
    ]


def create_app() -> FastAPI:
    configure_logging()
    started = time.time()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            f"REST API for {settings.BRAND_NAME}.\n\n"
            "**Security model** — JWT bearer access tokens (short lived) plus rotating refresh "
            "tokens stored as digests; RBAC enforced per route and per row; PII encrypted at rest "
            "and masked in responses unless the caller holds `pii:reveal`; every mutation audited."
        ),
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        openapi_tags=_openapi_tags(),
        contact={"name": settings.BRAND_NAME, **({"email": settings.SUPPORT_EMAIL} if settings.SUPPORT_EMAIL else {})},
        license_info={"name": "Proprietary"},
        servers=[{"url": settings.API_V1_PREFIX, "description": settings.ENVIRONMENT}],
    )

    # ------------------------------------------------------------ middleware
    # Order: outermost first. RequestContext must wrap everything to stamp ids.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    # Host header validation (prevents host-header poisoning / cache attacks).
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)
    # Explicit origin allowlist; credentials on so the SPA can send its token.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
        max_age=600,
    )

    register_exception_handlers(app)

    # --------------------------------------------------------------- routing
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "docs": "/docs" if settings.docs_enabled else None,
            "api": settings.API_V1_PREFIX,
        }

    # -------------------------------------------------------------- lifecycle
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        from app.db.session import dispose_engine, get_engine

        try:
            with get_engine().connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("Database connectivity verified", extra={"event": "startup.db_ok"})
            if settings.ENVIRONMENT in {"local", "test"}:
                from app.db.init_db import bootstrap_database

                bootstrap_database()
        except Exception as exc:
            logger.error("Startup database check failed: %s", exc, extra={"event": "startup.db_failed"})

        logger.info(
            "API started",
            extra={"event": "startup", "environment": settings.ENVIRONMENT, "version": settings.APP_VERSION},
        )
        yield
        dispose_engine()
        logger.info("API stopped", extra={"event": "shutdown"})

    app.router.lifespan_context = lifespan

    @app.middleware("http")
    async def add_server_timing(request, call_next):
        response = await call_next(request)
        response.headers["Server-Timing"] = f"app;dur={(time.time() - started) * 1000:.0f}"
        return response

    return app


app = create_app()
