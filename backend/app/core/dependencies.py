"""FastAPI dependencies: DB session, authentication, RBAC guards, pagination.

Routes stay declarative::

    @router.get("/bookings")
    def list_bookings(
        page: PaginationDep,
        actor: ActorDep,
        db: DbDep,
        _: Annotated[None, Depends(require(Permission.BOOKING_VIEW_ALL, Permission.BOOKING_VIEW_OWN))],
    ):
        ...

``require(...)`` is the only sanctioned way to gate an endpoint: it consults the
central permission matrix, logs denials and returns a consistent 403.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Annotated

from fastapi import Depends, Query, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError as JWTError
from sqlalchemy.orm import Session

from app.core.constants import Permission, Role, UserStatus
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.logging import get_logger, request_id_var, user_id_var
from app.core.permissions import ensure_permission
from app.core.security import decode_token
from app.db.session import get_db
from app.db.tenancy import set_scope
from app.models.tenant import Tenant
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.rbac_service import RBACService

logger = get_logger(__name__)

#: ``auto_error=False`` so we can raise our own 401 with the standard envelope.
bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token")

# scope="function": commit/rollback run when the endpoint returns, *before* the response is sent,
# so a client's very next request always sees what the previous one wrote.
DbDep = Annotated[Session, Depends(get_db, scope="function")]


def client_ip(request: Request) -> str:
    from app.core.middleware import client_ip as resolve_ip

    return resolve_ip(request)


def get_current_user(
    request: Request,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)] = None,
) -> User:
    """Decode the bearer token and load the account (single DB round trip)."""
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Authentication credentials were not provided")
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except JWTError as exc:
        logger.info("Rejected access token: %s", exc, extra={"event": "auth.token_invalid"})
        raise AuthenticationError("Your session has expired. Please sign in again.") from exc

    user_id = int(payload["sub"])
    user = UserRepository(db).get(user_id)
    if user is None or user.is_deleted:
        raise AuthenticationError("Account no longer exists")
    if user.status == UserStatus.SUSPENDED.value:
        raise PermissionDeniedError("This account is suspended")
    if user.status == UserStatus.PENDING.value:
        raise AuthenticationError("This account is waiting for administrator activation")
    if user.is_locked:
        raise AuthenticationError("Account temporarily locked")

    # Tenant gate: platform accounts have no tenant; everyone else must belong to
    # an ACTIVE one. Checked on every request, so suspending a tenant locks its
    # users out immediately — not only at their next sign-in.
    tenant: Tenant | None = None
    if user.role == Role.SUPER_ADMIN.value:
        scope_tenant_id = None
    elif user.tenant_id is None:
        raise AuthenticationError("Account is not linked to an organisation")
    else:
        tenant = db.get(Tenant, user.tenant_id)
        if tenant is None or not tenant.is_active:
            raise PermissionDeniedError(
                "Your organisation's access is suspended. Contact the platform administrator."
            )
        scope_tenant_id = tenant.id

    # From here on every query on this request is filtered to the caller's tenant.
    set_scope(db, scope_tenant_id)
    request.state.tenant = tenant

    # Correlation: logs and audit rows carry the authenticated actor.
    user_id_var.set(str(user.id))
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def get_actor(request: Request, db: DbDep, user: CurrentUserDep) -> ActorContext:
    """Build the service-layer actor (permissions resolved once per request)."""
    rbac = RBACService(db)
    granted, revoked = rbac.overrides(user)
    return ActorContext(
        user_id=user.id,
        public_id=user.public_id,
        name=user.name,
        email=user.email,
        role=user.role,
        customer_id=user.customer_id,
        agent_id=rbac.agent_id_for(user),
        tenant_id=None if user.role == Role.SUPER_ADMIN.value else user.tenant_id,
        tenant_name=getattr(getattr(request.state, "tenant", None), "name", None),
        extra_permissions=granted,
        revoked_permissions=revoked,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:255],
        request_id=request_id_var.get(),
    )


ActorDep = Annotated[ActorContext, Depends(get_actor)]


def require(*permissions: Permission | str, match_all: bool = False) -> Callable[[ActorContext], None]:
    """Declarative permission guard (any-of by default, all-of when asked)."""
    if not permissions:
        raise ValueError("require() needs at least one permission")

    def _guard(actor: ActorDep) -> None:
        if match_all:
            for permission in permissions:
                ensure_permission(actor.role, permission, actor_id=actor.user_id)
            return
        if not any(actor.can(permission) for permission in permissions):
            ensure_permission(actor.role, permissions[0], actor_id=actor.user_id)

    return _guard


def require_staff(actor: ActorDep) -> None:
    """Portal customers can never reach internal endpoints."""
    ensure_permission(actor.role, Permission.DASHBOARD_VIEW, actor_id=actor.user_id)


def get_pagination(
    page: Annotated[int, Query(ge=1, le=10_000, description="1-based page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="Rows per page")] = 25,
    search: Annotated[str | None, Query(max_length=100)] = None,
    sort: Annotated[str | None, Query(max_length=40, description="field:asc|desc")] = None,
) -> PaginationContext:
    """Bounded pagination: ``page_size`` can never be used to scrape the table."""
    return PaginationContext(page=page, page_size=page_size, search=search, sort=sort)


PaginationDep = Annotated[PaginationContext, Depends(get_pagination)]
StaffDep = Annotated[None, Depends(require_staff)]


def optional_filters(**spec: str) -> Callable[..., dict]:
    """Build a dependency that whitelists which filter keys a route accepts.

    Example: ``filters: Annotated[dict, Depends(optional_filters(status="status"))]``
    """

    def _dependency(request: Request) -> dict:
        allowed = set(spec.values())
        filters: dict = {}
        for key, value in request.query_params.items():
            if key in allowed and value not in ("", "all", None):
                filters[key] = value
        return filters

    return _dependency


def roles_allowed(*roles: Role) -> Callable[[ActorDep], None]:
    """Escape hatch for the rare endpoint that is genuinely role-shaped."""
    allowed = {role.value for role in roles}

    def _guard(actor: ActorDep) -> None:
        if actor.role not in allowed:
            raise PermissionDeniedError("This action is restricted to specific roles")

    return _guard


def permissions_of(role: str | Role) -> Iterable[str]:
    from app.core.permissions import normalise_role, permissions_for

    return sorted(permission.value for permission in permissions_for(normalise_role(role)))
