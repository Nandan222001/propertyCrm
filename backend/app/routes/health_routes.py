"""Health, readiness and metrics routes (never rate limited, never authenticated)."""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.controllers import health_controller as controller

router = APIRouter(tags=["Operations"])


@router.get("/health", summary="Liveness probe")
def health() -> dict:
    return controller.health()


@router.get("/ready", summary="Readiness probe (checks database)")
def ready(response: Response) -> dict:
    return controller.ready(response)


@router.get("/metrics", summary="Minimal Prometheus metrics")
def metrics() -> Response:
    return controller.metrics()


@router.get("/branding", summary="Deployment name shown on the sign-in page")
def branding() -> dict:
    from app.core.config import settings
    from app.core.responses import success

    return success({"name": settings.BRAND_NAME, "tagline": settings.BRAND_TAGLINE}, "Branding")
