"""Audit + security-event writer.

Two different concerns, one service so callers cannot forget either:

* :meth:`AuditService.log` — business trail (who changed which record);
* :meth:`AuditService.security_event` — abuse/anomaly signals, which also raise a
  structured ``security.*`` log line for the SIEM/log-based alerts.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import AuditAction
from app.core.context import ActorContext
from app.core.logging import get_logger, log_security_event, request_id_var
from app.db.base import utcnow
from app.db.tenancy import current_scope
from app.models.audit import AuditLog, SecurityEvent
from app.repositories.governance_repository import AuditLogRepository, SecurityEventRepository

logger = get_logger(__name__)

def persist_security_event(
    event: str,
    severity: str,
    message: str,
    actor_label: str | None = None,
    ip_address: str | None = None,
    path: str | None = None,
    context: dict | None = None,
    tenant_id: int | None = None,
) -> SecurityEvent | None:
    """Write a security event in its own transaction (best effort).

    Returns the row, or ``None`` when the isolated write is not possible so the
    caller can fall back to the request transaction. Never raises: telemetry
    failures must not break the request.
    """
    try:
        from app.db.session import session_scope

        with session_scope() as db:
            record = SecurityEventRepository(db).record(
                event=event,
                severity=severity,
                message=message[:1000],
                actor_label=actor_label,
                ip_address=ip_address,
                path=path,
                context=context,
                tenant_id=tenant_id,
            )
            db.flush()
            db.expunge(record)
            return record
    except Exception as exc:
        logger.warning("Security event persisted in-request instead: %s", exc)
        return None


SEVERITY_BY_EVENT = {
    "auth.login_failed": "warning",
    "auth.account_locked": "error",
    "rbac.denied": "warning",
    "security.rate_limited": "warning",
    "security.oversized_body": "warning",
    "security.suspicious_input": "error",
    "privacy.erasure": "info",
}


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.logs = AuditLogRepository(db)
        self.events = SecurityEventRepository(db)

    # -------------------------------------------------------------- business
    def log(
        self,
        *,
        action: AuditAction | str,
        resource: str,
        resource_id: str | None = None,
        summary: str | None = None,
        actor: ActorContext | None = None,
        before_state: dict | None = None,
        after_state: dict | None = None,
        status_code: int | None = None,
    ) -> AuditLog | None:
        if not settings.AUDIT_LOG_ENABLED:
            return None
        fields: dict[str, Any] = {
            "action": action.value if isinstance(action, AuditAction) else str(action),
            "resource": resource,
            "resource_id": resource_id,
            "summary": (summary or "")[:255] or None,
            "before_state": before_state,
            "after_state": after_state,
            "request_id": request_id_var.get(),
            "status_code": status_code,
            "occurred_at": utcnow(),
        }
        if actor is not None:
            fields.update(actor.audit_fields())
            fields["user_agent"] = actor.user_agent
        record = self.logs.record(**fields)
        self.db.flush()
        logger.info(
            "audit",
            extra={
                "event": fields["action"],
                "action": fields["action"],
                "resource": resource,
                "resource_id": resource_id,
                "actor_id": fields.get("actor_id"),
            },
        )
        return record

    # -------------------------------------------------------------- security
    def security_event(
        self,
        event: str,
        message: str,
        *,
        severity: str | None = None,
        actor: ActorContext | None = None,
        context: dict | None = None,
        path: str | None = None,
    ) -> SecurityEvent | None:
        """Persist an abuse/anomaly signal.

        Telemetry must survive the failure it describes, so when
        ``AUDIT_SEPARATE_SESSION`` is on (default) it is written in its own
        transaction: a 401/403/423 response rolls the request transaction back,
        and the evidence must not disappear with it. If the standalone write is
        not possible (e.g. SQLite holding a write lock) it falls back to the
        request session and the caller commits explicitly.
        """
        level = severity or SEVERITY_BY_EVENT.get(event, "warning")
        log_security_event(event, message, severity=level, context=context or {})
        fields = {
            "event": event,
            "severity": level,
            "message": message[:1000],
            "actor_label": (actor.email or actor.name) if actor else None,
            "ip_address": actor.ip_address if actor else None,
            "path": path,
            "context": context,
            # The caller's tenant (or the bound session's) so a tenant admin only
            # ever sees its own organisation's security signals.
            "tenant_id": actor.tenant_id if actor and actor.tenant_id is not None else (
                scope.tenant_id if (scope := current_scope(self.db)) is not None else None
            ),
        }
        if settings.AUDIT_SEPARATE_SESSION:
            persisted = persist_security_event(**fields)
            if persisted is not None:
                return persisted
        record = self.events.record(**fields)
        self.db.flush()
        return record

    # ------------------------------------------------------------- reporting
    def activity_summary(self, *, days: int = 7) -> dict[str, Any]:
        since = utcnow() - timedelta(days=days)
        return {
            "range_days": days,
            "actions": self.logs.action_histogram(since),
            "security_events": {
                "unacknowledged": len(self.events.unacknowledged()),
                "login_failures": self.events.count_since("auth.login_failed", since),
                "denied": self.events.count_since("rbac.denied", since),
                "rate_limited": self.events.count_since("security.rate_limited", since),
            },
        }

    def purge_expired(self, *, as_of: datetime | None = None) -> dict[str, int]:
        """Retention job honouring ``AUDIT_RETENTION_DAYS``."""
        cutoff = as_of or (utcnow() - timedelta(days=settings.AUDIT_RETENTION_DAYS))
        deleted = self.logs.purge_before(cutoff)
        self.db.flush()
        return {"audit_logs_deleted": deleted, "cutoff": cutoff.date().isoformat()}
