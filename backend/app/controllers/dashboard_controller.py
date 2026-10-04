"""Role-aware dashboard endpoint."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep
from app.core.responses import success
from app.services.dashboard_service import DashboardService


def get_dashboard_service(db: DbDep, actor: ActorDep) -> DashboardService:
    return DashboardService(db, actor)


DashboardServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]


def dashboard(service: DashboardServiceDep) -> dict:
    """One payload per role — KPIs are computed server-side, never in the SPA."""
    return success(service.build().model_dump(mode="json"), "Dashboard")
