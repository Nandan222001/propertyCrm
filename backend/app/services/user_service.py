"""User administration (staff provisioning, suspension, portal linkage)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import AuditAction, Permission, Role, UserStatus
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, ConflictError, PermissionDeniedError
from app.core.responses import Paginated
from app.core.security import hash_password
from app.db.base import utcnow
from app.models.tenant import Tenant
from app.models.user import User
from app.repositories.finance_repository import AgentRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import SessionUser
from app.schemas.governance import UserCreate, UserResponse, UserUpdate
from app.services.audit_service import AuditService
from app.services.base_service import BaseService
from app.services.rbac_service import RBACService


class UserService(BaseService[User]):
    resource = "user"
    repository_class = UserRepository
    permissions = {
        "view": Permission.USER_VIEW,
        "create": Permission.USER_MANAGE,
        "update": Permission.USER_MANAGE,
        "delete": Permission.USER_MANAGE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.users: UserRepository = self.repository  # type: ignore[assignment]
        self.agents = AgentRepository(db)
        self.rbac = RBACService(db)
        self.audit = AuditService(db)

    # ------------------------------------------------------------------ read
    def paginate(self, page: PaginationContext) -> Paginated[User]:
        return self.list(page)

    def serialise(self, user: User, *, include_permissions: bool = True) -> UserResponse:
        grants = [
            {"permission": g.permission, "granted": g.granted, "reason": g.reason}
            for g in self.rbac.grants.for_user(user.id)
        ]
        return UserResponse(
            id=user.id,
            public_id=user.public_id,
            name=user.name,
            email=user.email,
            phone=user.phone,
            role=user.role,
            status=user.status,
            title=user.title,
            agent_code=user.agent_code,
            customer_id=user.customer_id,
            last_login_at=user.last_login_at,
            failed_login_attempts=user.failed_login_attempts,
            locked_until=user.locked_until,
            mfa_enabled=user.mfa_enabled,
            permissions=sorted(self.rbac.effective_permissions(user)) if include_permissions else [],
            extra_grants=grants,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )

    # ---------------------------------------------------------------- create
    def create_user(self, payload: UserCreate) -> User:
        self._authorise("create")
        email = payload.email.lower().strip()
        if self.users.get_by_email(email):
            raise ConflictError("A user with this e-mail already exists")
        self._assert_escalation_allowed(payload.role)
        self._assert_seat_available()

        user = User(
            name=payload.name,
            email=email,
            phone=payload.phone,
            role=payload.role.value,
            title=payload.title,
            status=UserStatus.INVITED.value,
            password_hash=hash_password(payload.temporary_password),
            must_change_password=1,
            password_changed_at=utcnow(),
            agent_code=payload.agent_code,
        )
        self.users.create(user)
        self._audit(AuditAction.CREATE, user, after={"role": user.role, "status": user.status},
                    summary=f"Provisioned {user.role} account")
        return user

    def update_user(self, user_id: int, payload: UserUpdate) -> User:
        self._authorise("update")
        user = self.users.get_or_404(user_id)
        values = payload.model_dump(exclude_unset=True, exclude_none=True)
        if "role" in values:
            self._assert_escalation_allowed(Role(values["role"]))
            values["role"] = Role(values["role"]).value
        if "status" in values:
            values["status"] = UserStatus(values["status"]).value
            if user.id == self.actor.user_id and values["status"] != UserStatus.ACTIVE.value:
                raise BusinessRuleError("You cannot deactivate your own account")
        before = {"role": user.role, "status": user.status, "title": user.title}
        self.users.update(user, values)
        self._audit(AuditAction.UPDATE, user, before=before,
                    after={"role": user.role, "status": user.status, "title": user.title},
                    summary="Updated account")
        return user

    def suspend(self, user_id: int, *, reason: str | None = None) -> User:
        self._authorise("update")
        user = self.users.get_or_404(user_id)
        if user.role == Role.SUPER_ADMIN.value and self.actor.role != Role.SUPER_ADMIN.value:
            raise PermissionDeniedError("Only a super admin can suspend a super admin")
        user.status = UserStatus.SUSPENDED.value
        self.db.flush()
        self._audit(AuditAction.UPDATE, user, summary=f"Suspended: {reason or 'no reason given'}")
        return user

    def unlock(self, user_id: int) -> User:
        self._authorise("update")
        user = self.users.get_or_404(user_id)
        user.status = UserStatus.ACTIVE.value
        user.failed_login_attempts = 0
        user.locked_until = None
        self.db.flush()
        self._audit(AuditAction.UPDATE, user, summary="Account unlocked")
        return user

    def set_permission_grants(self, user_id: int, grants: list[dict]) -> list[dict]:
        """Only a super admin may hand out permissions beyond a role."""
        if not self.actor.can(Permission.ROLE_MANAGE):
            raise PermissionDeniedError("Your role cannot change permission grants")
        user = self.users.get_or_404(user_id)
        applied = self.rbac.set_grants(user, grants, granted_by=self.actor.name)
        self._audit(AuditAction.CONFIG_CHANGE, user, summary=f"Permission grants updated ({len(applied)})")
        return applied

    def delete_user(self, user_id: int) -> User:
        self._authorise("delete")
        user = self.users.get_or_404(user_id)
        if user.id == self.actor.user_id:
            raise BusinessRuleError("You cannot delete your own account")
        if user.role == Role.SUPER_ADMIN.value:
            raise BusinessRuleError("Super admin accounts cannot be deleted, only suspended")
        self.users.delete(user, actor=self.actor.name)
        self._audit(AuditAction.DELETE, user, summary="Account deleted (soft)")
        return user

    def session_actor(self, user: User) -> SessionUser:
        from app.services.auth_service import AuthService

        return AuthService(self.db).session_user(user)

    # --------------------------------------------------------------- helpers
    def _assert_escalation_allowed(self, target_role: Role) -> None:
        """Privilege-escalation guard: organisation staff can never mint platform accounts."""
        actor_role = Role(self.actor.role)
        if target_role == Role.SUPER_ADMIN:
            raise PermissionDeniedError("Platform accounts are managed outside an organisation")
        if actor_role != Role.ADMIN:
            raise PermissionDeniedError("Your role cannot manage user accounts")

    def _assert_seat_available(self) -> None:
        """Enforce the tenant's ``max_users`` (seat) limit when creating accounts."""
        if self.actor.tenant_id is None:
            return
        tenant = self.db.get(Tenant, self.actor.tenant_id)
        if tenant is None:
            return
        seats = int(self.db.execute(
            select(func.count(User.id)).where(User.is_deleted.is_(False))
        ).scalar_one() or 0)
        if seats >= tenant.max_users:
            raise BusinessRuleError(
                f"Your plan allows {tenant.max_users} users. Contact the platform administrator to add seats."
            )
