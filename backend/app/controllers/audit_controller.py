"""Governance endpoints: audit trail, security events, settings, ops jobs."""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Query

from app.core.constants import AuditAction, Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.core.responses import success
from app.db.base import utcnow
from app.repositories.governance_repository import AuditLogRepository, SecurityEventRepository
from app.schemas.governance import SettingUpdate
from app.services.audit_service import AuditService
from app.services.notification_service import SettingService


def audit_logs(
    page: PaginationDep,
    db: DbDep,
    actor: ActorDep,
    _: Annotated[None, Depends(require(Permission.AUDIT_VIEW))] = None,
) -> dict:
    repository = AuditLogRepository(db)
    result = repository.paginate(
        page=page.page, page_size=page.page_size, search=page.search, sort=page.sort or "occurred_at:desc",
        filters=page.filters,
    )
    return success(
        [
            {
                "id": row.id,
                "action": row.action,
                "resource": row.resource,
                "resource_id": row.resource_id,
                "summary": row.summary,
                "actor_label": row.actor_label,
                "actor_role": row.actor_role,
                "ip_address": row.ip_address,
                "request_id": row.request_id,
                "occurred_at": row.occurred_at.isoformat(),
            }
            for row in result.items
        ],
        meta=result.meta.model_dump(),
        message="Audit trail",
    )


def security_events(
    page: PaginationDep,
    db: DbDep,
    _: Annotated[None, Depends(require(Permission.AUDIT_VIEW))] = None,
) -> dict:
    repository = SecurityEventRepository(db)
    result = repository.paginate(
        page=page.page, page_size=page.page_size, search=page.search, sort="created_at:desc"
    )
    return success(
        [
            {
                "id": row.id,
                "event": row.event,
                "severity": row.severity,
                "message": row.message,
                "ip_address": row.ip_address,
                "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
                "created_at": row.created_at.isoformat(),
            }
            for row in result.items
        ],
        meta=result.meta.model_dump(),
        message="Security events",
    )


def acknowledge_event(event_id: int, db: DbDep, actor: ActorDep,
                      _: Annotated[None, Depends(require(Permission.AUDIT_VIEW))] = None) -> dict:
    repository = SecurityEventRepository(db)
    event = repository.get_or_404(event_id)
    event.acknowledged_at = utcnow()
    event.acknowledged_by = actor.name
    db.flush()
    return success({"id": event.id, "acknowledged_by": actor.name}, "Security event acknowledged")


def list_settings(db: DbDep, actor: ActorDep,
                  _: Annotated[None, Depends(require(Permission.SETTINGS_MANAGE))] = None) -> dict:
    return success(SettingService(db, actor).grouped(), "Settings")


def update_setting(key: str, payload: SettingUpdate, db: DbDep, actor: ActorDep,
                   _: Annotated[None, Depends(require(Permission.SETTINGS_MANAGE))] = None) -> dict:
    service = SettingService(db, actor)
    setting = service.update_setting(key, payload)
    return success(service.serialise(setting).model_dump(), f"Setting '{key}' updated")


def retention_sweep(
    db: DbDep,
    actor: ActorDep,
    days: int = Query(default=3650, ge=365, le=7300),
    _: Annotated[None, Depends(require(Permission.SETTINGS_MANAGE))] = None,
) -> dict:
    """Data-retention job: purge audit rows older than the retention window."""
    service = AuditService(db)
    result = service.purge_expired(as_of=utcnow() - timedelta(days=days))
    service.log(action=AuditAction.BACKUP, resource="audit", summary=f"Retention sweep: {result}",
                actor=actor)
    return success(result, "Retention sweep completed")


def organisation_settings(db: DbDep, actor: ActorDep) -> dict:
    from app.core.exceptions import PermissionDeniedError
    from app.services import org_settings

    if actor.tenant_id is None:
        raise PermissionDeniedError("Organisation settings belong to a tenant")
    return success(org_settings.read_all(db, actor.tenant_id), "Organisation settings")


def save_organisation_settings(section: str, payload: dict, db: DbDep, actor: ActorDep) -> dict:
    from app.services import org_settings

    values = payload.get("values") if isinstance(payload.get("values"), dict) else payload
    saved = org_settings.write_section(db, actor, section, values)
    return success(saved, f"{section.title()} settings saved")
