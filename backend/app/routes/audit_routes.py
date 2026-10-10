"""Governance routes: audit log, security events, settings, retention job."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.controllers import audit_controller as controller
from app.core.constants import Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.schemas.governance import SettingUpdate

router = APIRouter(tags=["Governance"])

AUDIT = Annotated[None, Depends(require(Permission.AUDIT_VIEW))]
SETTINGS = Annotated[None, Depends(require(Permission.SETTINGS_MANAGE))]


@router.get("/audit-logs", summary="Business audit trail")
def audit_logs(page: PaginationDep, db: DbDep, actor: ActorDep, _: AUDIT = None):
    return controller.audit_logs(page, db, actor, None)


@router.get("/security-events", summary="Security event stream")
def security_events(page: PaginationDep, db: DbDep, _: AUDIT = None):
    return controller.security_events(page, db, None)


@router.post("/security-events/{event_id}/acknowledge", summary="Acknowledge a security event")
def acknowledge(event_id: int, db: DbDep, actor: ActorDep, _: AUDIT = None):
    return controller.acknowledge_event(event_id, db, actor, None)


@router.get("/settings", summary="Runtime settings (secrets masked)")
def list_settings(db: DbDep, actor: ActorDep, _: SETTINGS = None):
    return controller.list_settings(db, actor, None)


@router.put("/settings/{key}", summary="Update a runtime setting")
def update_setting(key: str, payload: SettingUpdate, db: DbDep, actor: ActorDep, _: SETTINGS = None):
    return controller.update_setting(key, payload, db, actor, None)


@router.post("/ops/retention-sweep", summary="Purge audit rows past the retention window")
def retention_sweep(db: DbDep, actor: ActorDep,
                    days: int = Query(default=3650, ge=365, le=7300),
                    _: SETTINGS = None):
    return controller.retention_sweep(db, actor, days, None)


@router.get("/organisation/settings", summary="Company profile, bank details and tax rules for printing")
def organisation_settings(db: DbDep, actor: ActorDep):
    return controller.organisation_settings(db, actor)


@router.put("/organisation/settings/{section}", summary="Save one settings section (company | bank | tax)")
def save_organisation_settings(section: str, payload: dict, db: DbDep, actor: ActorDep, _: SETTINGS = None):
    return controller.save_organisation_settings(section, payload, db, actor)
