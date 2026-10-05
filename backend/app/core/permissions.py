"""Role-based access control helpers.

Single source of truth: :data:`app.core.constants.ROLE_PERMISSIONS`. Services call
:func:`ensure_permission` for business-level checks; routes express the same rules
declaratively through the ``require(...)`` dependency factory. Roles are never
compared string-by-string in feature code — that is how permission bugs happen.
"""

from __future__ import annotations

from collections.abc import Iterable
from functools import cache

from app.core.constants import ROLE_PERMISSIONS, STAFF_ROLES, Permission, Role
from app.core.exceptions import PermissionDeniedError
from app.core.logging import log_security_event


def normalise_role(role: str | Role) -> Role:
    """Accept ``"SUPER ADMIN"``, ``"super_admin"`` or a :class:`Role`."""
    if isinstance(role, Role):
        return role
    cleaned = str(role).strip().upper().replace(" ", "_").replace("-", "_")
    try:
        return Role(cleaned)
    except ValueError as exc:  # unknown role → deny, never guess
        raise PermissionDeniedError(f"Unknown role: {role}") from exc


@cache
def permissions_for(role: Role) -> frozenset[Permission]:
    return ROLE_PERMISSIONS.get(role, frozenset())


def has_permission(role: str | Role, permission: Permission | str) -> bool:
    try:
        resolved = normalise_role(role)
    except PermissionDeniedError:
        return False
    wanted = Permission(permission) if isinstance(permission, str) else permission
    return wanted in permissions_for(resolved)


def has_any(role: str | Role, permissions: Iterable[Permission | str]) -> bool:
    return any(has_permission(role, p) for p in permissions)


def has_all(role: str | Role, permissions: Iterable[Permission | str]) -> bool:
    return all(has_permission(role, p) for p in permissions)


def ensure_permission(
    role: str | Role,
    permission: Permission | str,
    *,
    resource: str | None = None,
    resource_id: str | int | None = None,
    actor_id: str | int | None = None,
) -> None:
    """Raise :class:`PermissionDeniedError` (403) and log the attempt."""
    if not has_permission(role, permission):
        log_security_event(
            event="rbac.denied",
            message=f"Role {role} lacks {permission}",
            action=str(permission),
            resource=resource,
            resource_id=resource_id,
            actor_id=actor_id,
        )
        raise PermissionDeniedError(
            f"Role {normalise_role(role).value} is not permitted to perform {permission}"
        )


def ensure_staff(role: str | Role) -> None:
    if normalise_role(role) not in STAFF_ROLES:
        ensure_permission(role, Permission.DASHBOARD_VIEW)


def is_staff(role: str | Role) -> bool:
    try:
        return normalise_role(role) in STAFF_ROLES
    except PermissionDeniedError:
        return False


def scope_for(role: str | Role) -> str:
    """Return the row-level scope a role operates on: ``all`` | ``own`` | ``self``."""
    resolved = normalise_role(role)
    if resolved in (Role.SALES_AGENT,):
        return "own"
    if resolved in (Role.CUSTOMER,):
        return "self"
    return "all"


def describe_role_matrix() -> list[dict[str, object]]:
    """Machine-readable matrix served at ``/users/roles`` for the admin UI."""
    return [
        {
            "role": role.value,
            "label": role.value.replace("_", " "),
            "is_staff": role in STAFF_ROLES,
            "permissions": sorted(p.value for p in permissions_for(role)),
        }
        for role in Role
    ]
