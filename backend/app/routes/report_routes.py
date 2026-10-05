"""Reporting / BI routes."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.controllers import report_controller as controller
from app.core.constants import Permission
from app.core.dependencies import require

router = APIRouter(prefix="/reports", tags=["Reports"])

VIEW = Annotated[None, Depends(require(Permission.REPORT_VIEW))]


@router.get("/sales", summary="Sales & booking register")
def sales(service: controller.ReportServiceDep, start: date | None = None, end: date | None = None,
          _: VIEW = None):
    return controller.sales_report(service, start, end)


@router.get("/collections", summary="Collections report")
def collections(service: controller.ReportServiceDep, start: date | None = None, end: date | None = None,
                _: VIEW = None):
    return controller.collections_report(service, start, end)


@router.get("/inventory", summary="Inventory absorption")
def inventory(service: controller.ReportServiceDep, _: VIEW = None):
    return controller.inventory_report(service)


@router.get("/ageing", summary="Receivables ageing (0-30/31-60/61-90/90+)")
def ageing(service: controller.ReportServiceDep, _: VIEW = None):
    return controller.ageing_report(service)


@router.get("/agents", summary="Agent performance")
def agents(service: controller.ReportServiceDep, _: VIEW = None):
    return controller.agent_report(service)


@router.get("/daily", summary="Daily business report")
def daily(service: controller.ReportServiceDep, as_of: date | None = None, _: VIEW = None):
    return controller.daily_report(service, as_of)


@router.get("/audit-trail", summary="Audit & security activity summary")
def audit_trail(service: controller.ReportServiceDep, days: int = Query(default=7, ge=1, le=90),
                _: VIEW = None):
    return controller.audit_trail(service, days, None)
