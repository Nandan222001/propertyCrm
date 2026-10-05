"""RBAC service: effective permissions, per-user grants and the role matrix."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.constants import ROLE_PERMISSIONS, Role
from app.core.permissions import describe_role_matrix, permissions_for
from app.models.payment import Agent
from app.models.user import User
from app.repositories.finance_repository import AgentRepository
from app.repositories.user_repository import UserPermissionGrantRepository


class RBACService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.grants = UserPermissionGrantRepository(db)
        self.agents = AgentRepository(db)

    # ---------------------------------------------------------- computations
    def effective_permissions(self, user: User) -> set[str]:
        base = {permission.value for permission in permissions_for(Role(user.role))}
        for grant in self.grants.for_user(user.id):
            if grant.granted:
                base.add(grant.permission)
            else:
                base.discard(grant.permission)
        # A SUPER_ADMIN's own revokes must not be self-defeating: they keep role
        # privileges unless an explicit revoke exists (handled above).
        return base

    def overrides(self, user: User) -> tuple[frozenset[str], frozenset[str]]:
        granted, revoked = set(), set()
        for grant in self.grants.for_user(user.id):
            (granted if grant.granted else revoked).add(grant.permission)
        return frozenset(granted), frozenset(revoked)

    def agent_id_for(self, user: User) -> int | None:
        """Resolve the agent row for SALES_AGENT scoping (own-records filter)."""
        if Role(user.role) != Role.SALES_AGENT:
            return None
        agent: Agent | None = self.agents.get_by_user(user.id)
        if agent is None and user.agent_code:
            agent = self.agents.get_by_code(user.agent_code)
        return agent.id if agent else None

    # -------------------------------------------------------------- mutation
    def set_grants(self, user: User, grants: list[dict], *, granted_by: str) -> list[dict]:
        self.grants.replace_for_user(
            user.id,
            [{**grant, "granted_by": granted_by} for grant in grants],
        )
        self.db.flush()
        return [
            {"permission": grant.permission, "granted": grant.granted, "reason": grant.reason}
            for grant in self.grants.for_user(user.id)
        ]

    # ------------------------------------------------------------- reporting
    @staticmethod
    def matrix() -> list[dict]:
        return describe_role_matrix()

    @staticmethod
    def permission_catalogue() -> list[dict]:
        """Every permission with the roles that hold it (drives the admin UI)."""
        catalogue: dict[str, list[str]] = {}
        for role, permissions in ROLE_PERMISSIONS.items():
            for permission in permissions:
                catalogue.setdefault(permission.value, []).append(role.value)
        return [
            {"permission": permission, "roles": sorted(roles), "group": permission.split(":")[0]}
            for permission, roles in sorted(catalogue.items())
        ]
