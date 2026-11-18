"""Anonymous, read-only endpoints. Everything here is a deliberate decision: see ``PUBLIC_PATHS``."""

from __future__ import annotations

from fastapi import APIRouter

from app.controllers import public_controller as controller
from app.core.dependencies import DbDep

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/plot-map", summary="Plot availability for the deployment's own organisation (sign-in page link)")
def default_plot_map(db: DbDep):
    return controller.default_plot_map(db)


@router.get("/plot-map/{slug}", summary="Plot availability for an organisation's public plot map")
def plot_map(slug: str, db: DbDep):
    return controller.plot_map(db, slug)
