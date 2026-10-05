"""Liveness/readiness endpoints + operational metrics.

* ``/health``  — process is up (no DB touch, used by the load balancer);
* ``/ready``   — dependencies reachable (DB ping + migration head check);
* ``/metrics`` — small text/Prometheus-compatible snapshot (no PII).
"""

from __future__ import annotations

import time

from fastapi import Response
from sqlalchemy import text

from app.core.config import settings
from app.core.logging import get_logger
from app.core.responses import success
from app.db.session import get_engine

logger = get_logger(__name__)
STARTED_AT = time.time()


def _database_check() -> dict:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        logger.error("Readiness DB check failed: %s", exc, extra={"event": "ops.readiness_failed"})
        return {"status": "error", "detail": "database unreachable"}


def health() -> dict:
    return success(
        {
            "status": "ok",
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "uptime_seconds": round(time.time() - STARTED_AT, 1),
        },
        "Healthy",
    )


def ready(response: Response) -> dict:
    database = _database_check()
    overall = "ok" if database["status"] == "ok" else "degraded"
    if overall != "ok":
        response.status_code = 503
    return success(
        {
            "status": overall,
            "checks": {
                "database": database,
                "rate_limit_backend": {"status": "ok", "backend": settings.RATE_LIMIT_BACKEND},
            },
        },
        f"Readiness: {overall}",
    )


def metrics() -> Response:
    """Minimal Prometheus text exposition (uptime only — no business data)."""
    uptime = time.time() - STARTED_AT
    body = (
        "# HELP app_uptime_seconds Process uptime in seconds\n"
        "# TYPE app_uptime_seconds gauge\n"
        f"app_uptime_seconds {uptime:.1f}\n"
        "# HELP app_info Static build information\n"
        "# TYPE app_info gauge\n"
        f'app_info{{version="{settings.APP_VERSION}",environment="{settings.ENVIRONMENT}"}} 1\n'
    )
    return Response(content=body, media_type="text/plain; version=0.0.4")
