"""BI / report endpoints. Every report shares one envelope so the UI is generic."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import Depends, Query

from app.core.constants import Permission
from app.core.dependencies import ActorDep, DbDep, require
from app.core.responses import success
from app.services.dashboard_service import ReportService


def get_report_service(db: DbDep, actor: ActorDep) -> ReportService:
    return ReportService(db, actor)


ReportServiceDep = Annotated[ReportService, Depends(get_report_service)]


def sales_report(service: ReportServiceDep, start: date | None = None, end: date | None = None) -> dict:
    return success(service.sales(start, end).model_dump(), "Sales report")


def collections_report(service: ReportServiceDep, start: date | None = None, end: date | None = None) -> dict:
    return success(service.collections(start, end).model_dump(), "Collections report")


def inventory_report(service: ReportServiceDep) -> dict:
    return success(service.inventory().model_dump(), "Inventory report")


def ageing_report(service: ReportServiceDep) -> dict:
    return success(service.ageing().model_dump(), "Receivables ageing")


def agent_report(service: ReportServiceDep) -> dict:
    return success(service.agent_performance().model_dump(), "Agent performance report")


def daily_report(service: ReportServiceDep, as_of: date | None = None) -> dict:
    return success(service.daily(as_of=as_of).model_dump(), "Daily business report")


def audit_trail(
    service: ReportServiceDep,
    days: int = Query(default=7, ge=1, le=90),
    _: Annotated[None, Depends(require(Permission.AUDIT_VIEW))] = None,
) -> dict:
    return success(service.audit_trail(days=days), "Audit & security activity")
