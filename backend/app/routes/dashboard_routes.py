"""Dashboard routes (one payload per role)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.controllers import dashboard_controller as controller
from app.core.constants import Permission
from app.core.dependencies import require

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

VIEW = Annotated[None, Depends(require(Permission.DASHBOARD_VIEW))]


@router.get("", summary="Role-aware KPI dashboard")
def dashboard(service: controller.DashboardServiceDep, _: VIEW = None):
    return controller.dashboard(service)
