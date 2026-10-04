"""Request actor context.

Passed explicitly into services instead of reaching into FastAPI globals, which
keeps services unit-testable and makes "who did this?" impossible to forget when
writing an audit entry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import Permission, Role
from app.core.permissions import has_permission, normalise_role


@dataclass(slots=True)
class ActorContext:
    """Everything a service needs to know about the caller."""

    user_id: int | None = None
    public_id: str | None = None
    name: str = "system"
    email: str | None = None
    role: str = Role.CUSTOMER.value
    customer_id: int | None = None
    agent_id: int | None = None
    extra_permissions: frozenset[str] = frozenset()
    revoked_permissions: frozenset[str] = frozenset()
    ip_address: str | None = None
    user_agent: str | None = None
    request_id: str | None = None
    is_authenticated: bool = True

    # ------------------------------------------------------------- helpers
    @property
    def resolved_role(self) -> Role:
        return normalise_role(self.role)

    def can(self, permission: Permission | str) -> bool:
        key = permission.value if isinstance(permission, Permission) else str(permission)
        if key in self.revoked_permissions:
            return False
        if key in self.extra_permissions:
            return True
        return has_permission(self.role, permission)

    @property
    def scope(self) -> str:
        from app.core.permissions import scope_for

        return scope_for(self.role)

    @property
    def is_customer_portal(self) -> bool:
        return self.resolved_role == Role.CUSTOMER

    def audit_fields(self) -> dict[str, Any]:
        return {
            "actor_id": self.user_id,
            "actor_label": self.name,
            "actor_role": self.role,
            "ip_address": self.ip_address,
            "request_id": self.request_id,
        }

    @classmethod
    def system(cls) -> ActorContext:
        """Background jobs / seeds run as an explicit system actor."""
        return cls(user_id=None, name="system", role=Role.SUPER_ADMIN.value, is_authenticated=False,
                   extra_permissions=frozenset(p.value for p in Permission))


@dataclass(slots=True)
class PaginationContext:
    page: int = 1
    page_size: int = 25
    search: str | None = None
    sort: str | None = None
    filters: dict[str, Any] = field(default_factory=dict)
