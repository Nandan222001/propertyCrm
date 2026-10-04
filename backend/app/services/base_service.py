"""Service base class — permission checks, auditing and CRUD shared by modules.

Every mutating operation flows through :meth:`BaseService._authorise`, so a new
endpoint cannot accidentally skip RBAC or the audit trail.
"""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import AuditAction, Permission
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import PermissionDeniedError
from app.core.permissions import ensure_permission
from app.core.responses import Paginated
from app.db.base import Base
from app.repositories.base_repository import BaseRepository
from app.services.audit_service import AuditService

ModelT = TypeVar("ModelT", bound=Base)


class BaseService(Generic[ModelT]):
    """Thin orchestration layer: authorise → act → audit → serialise."""

    resource: str = "resource"
    repository_class: type[BaseRepository]
    #: action → permission required for it (a tuple means "any of these")
    permissions: dict[str, Permission | tuple[Permission, ...]] = {
        "view": Permission.DASHBOARD_VIEW,
        "create": Permission.SETTINGS_MANAGE,
        "update": Permission.SETTINGS_MANAGE,
        "delete": Permission.SETTINGS_MANAGE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        self.db = db
        self.actor = actor
        self.repository: BaseRepository[ModelT] = self.repository_class(db)  # type: ignore[call-arg]
        self.audit = AuditService(db)

    # ---------------------------------------------------------- authorisation
    def _authorise(self, action: str) -> None:
        """Pass when the actor holds any of the action's permissions."""
        permission = self.permissions.get(action)
        if permission is None:
            raise PermissionDeniedError(f"No permission mapping configured for '{action}'")
        candidates = permission if isinstance(permission, tuple) else (permission,)
        # Per-user revokes always win, even when the role matrix would allow it.
        allowed = [p for p in candidates if p.value not in self.actor.revoked_permissions]
        if not allowed or not any(self.actor.can(p) for p in allowed):
            ensure_permission(
                self.actor.role,
                allowed[0] if allowed else candidates[0],
                resource=self.resource,
                actor_id=self.actor.user_id,
            )

    # ------------------------------------------------------------------ read
    def list(self, page: PaginationContext, *, scope_clause: Any = None) -> Paginated[ModelT]:
        self._authorise("view")
        return self.repository.paginate(
            page=page.page,
            page_size=page.page_size,
            filters=page.filters,
            search=page.search,
            sort=page.sort,
            scope_clause=scope_clause,
        )

    def get(self, entity_id: int, *, scope_clause: Any = None) -> ModelT:
        """Fetch one row, honouring the caller's row-level scope predicate."""
        self._authorise("view")
        entity = self.repository.get_or_404(entity_id)
        if scope_clause is not None:
            visible = self.db.execute(
                self.repository._base_query()
                .where(scope_clause, self.repository.model.id == entity_id)
            ).scalars().first()
            if visible is None:
                raise PermissionDeniedError("You do not have access to this record")
        return entity

    # ---------------------------------------------------------------- write
    def create(self, values: dict[str, Any]) -> ModelT:
        self._authorise("create")
        entity = self.repository.create(self.repository.model(**values))
        self._audit(AuditAction.CREATE, entity, after=self._snapshot(entity))
        return entity

    def update(self, entity_id: int, values: dict[str, Any]) -> ModelT:
        self._authorise("update")
        entity = self.repository.get_or_404(entity_id)
        before = self._snapshot(entity)
        self.repository.update(entity, values)
        self._audit(AuditAction.UPDATE, entity, before=before, after=self._snapshot(entity))
        return entity

    def delete(self, entity_id: int) -> ModelT:
        self._authorise("delete")
        entity = self.repository.get_or_404(entity_id)
        self.repository.delete(entity, actor=self.actor.name)
        self._audit(AuditAction.DELETE, entity, before=self._snapshot(entity))
        return entity

    # --------------------------------------------------------------- helpers
    def _snapshot(self, entity: ModelT, exclude: tuple[str, ...] = ()) -> dict[str, Any]:
        """Audit-safe snapshot: never persists secrets or PII ciphertext."""
        blocked = {"password_hash", "token_digest", "mfa_secret_encrypted", "email", "phone", "address"} | set(exclude)
        return {
            column.key: str(getattr(entity, column.key))
            for column in entity.__table__.columns
            if column.key not in blocked
        }

    def _audit(self, action: AuditAction | str, entity: ModelT, *, before: dict | None = None,
               after: dict | None = None, summary: str | None = None) -> None:
        if not settings.AUDIT_LOG_ENABLED:
            return
        self.audit.log(
            action=action,
            resource=self.resource,
            resource_id=str(getattr(entity, "public_id", getattr(entity, "id", ""))),
            summary=summary or f"{action.value} {self.resource}",
            actor=self.actor,
            before_state=before,
            after_state=after,
        )

    def record_custom_audit(self, action: AuditAction | str, *, resource_id: str = "", summary: str = "",
                            before: dict | None = None, after: dict | None = None) -> None:
        self.audit.log(
            action=action, resource=self.resource, resource_id=resource_id, summary=summary,
            actor=self.actor, before_state=before, after_state=after,
        )
