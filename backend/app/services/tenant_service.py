"""Platform control plane: create, edit, suspend and reactivate tenants.

Only platform accounts (super admins) reach this service. Tenant data is never
read here beyond per-tenant *counts* (``all_tenants`` statements), so the
platform can run the business of hosting tenants without seeing their records.
"""

from __future__ import annotations

import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import AuditAction, Permission, Role, TenantStatus, UserStatus
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError, PermissionDeniedError
from app.core.passwords import initial_password
from app.core.responses import Paginated, paginate
from app.core.security import hash_password
from app.db.base import utcnow
from app.models.booking import Booking
from app.models.customer import Customer
from app.models.property import Plot, Project
from app.models.tenant import Tenant
from app.models.user import AuthToken, User
from app.schemas.tenant import (
    RESERVED_SLUGS,
    TenantAdminIn,
    TenantAdminResponse,
    TenantCreate,
    TenantProvisioned,
    TenantResponse,
    TenantUpdate,
    TenantUsage,
)
from app.services.audit_service import AuditService

#: Per-tenant usage counters: (response field, model, soft-delete aware?)
USAGE_MODELS = (
    ("users", User, True),
    ("projects", Project, True),
    ("plots", Plot, True),
    ("customers", Customer, True),
    ("bookings", Booking, True),
)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48].strip("-")
    return slug if len(slug) >= 2 else f"org-{secrets.token_hex(2)}"


class TenantService:
    def __init__(self, db: Session, actor: ActorContext) -> None:
        self.db = db
        self.actor = actor
        self.audit = AuditService(db)

    # ----------------------------------------------------------- authorisation
    def _require(self, permission: Permission) -> None:
        if not self.actor.is_platform or not self.actor.can(permission):
            raise PermissionDeniedError("Only the platform administrator can manage tenants")

    # ----------------------------------------------------------------- queries
    def _usage(self, tenant_ids: list[int]) -> dict[int, dict[str, int]]:
        usage: dict[int, dict[str, int]] = {tid: {} for tid in tenant_ids}
        if not tenant_ids:
            return usage
        for field, model, soft in USAGE_MODELS:
            stmt = select(model.tenant_id, func.count(model.id)).where(model.tenant_id.in_(tenant_ids))
            if soft:
                stmt = stmt.where(model.is_deleted.is_(False))
            if model is User:
                stmt = stmt.where(User.role != Role.CUSTOMER.value)   # customer logins are not staff seats
            rows = self.db.execute(stmt.group_by(model.tenant_id).execution_options(all_tenants=True)).all()
            for tenant_id, total in rows:
                usage[tenant_id][field] = int(total)
        return usage

    def _primary_admins(self, tenant_ids: list[int]) -> dict[int, str]:
        """Oldest ADMIN e-mail per tenant (one query for the whole page)."""
        if not tenant_ids:
            return {}
        rows = self.db.execute(
            select(User.tenant_id, User.email).where(
                User.tenant_id.in_(tenant_ids), User.role == Role.ADMIN.value, User.is_deleted.is_(False)
            ).order_by(User.id).execution_options(all_tenants=True)
        ).all()
        result: dict[int, str] = {}
        for tenant_id, email in rows:
            result.setdefault(tenant_id, email)
        return result

    def serialise(self, tenant: Tenant, usage: dict[str, int] | None = None,
                  admins: dict[int, str] | None = None) -> TenantResponse:
        counts = usage if usage is not None else self._usage([tenant.id])[tenant.id]
        primary = admins if admins is not None else self._primary_admins([tenant.id])
        response = TenantResponse.model_validate(tenant)
        response.usage = TenantUsage(**counts)
        response.primary_admin_email = primary.get(tenant.id)
        return response

    def get(self, tenant_id: int) -> Tenant:
        self._require(Permission.TENANT_VIEW)
        tenant = self.db.get(Tenant, tenant_id)
        if tenant is None:
            raise NotFoundError(f"Tenant {tenant_id} was not found")
        return tenant

    def paginate(self, page: PaginationContext, status: str | None = None) -> Paginated[TenantResponse]:
        self._require(Permission.TENANT_VIEW)
        stmt = select(Tenant)
        if status:
            stmt = stmt.where(Tenant.status == status.upper())
        if page.search:
            like = f"%{page.search.strip()[:100]}%"
            stmt = stmt.where((Tenant.name.like(like)) | (Tenant.slug.like(like)) | (Tenant.contact_email.like(like)))
        total = int(self.db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one() or 0)
        rows = list(self.db.execute(
            stmt.order_by(Tenant.created_at.desc(), Tenant.id.desc())
            .limit(page.page_size).offset((page.page - 1) * page.page_size)
        ).scalars().all())
        usage = self._usage([t.id for t in rows])
        admins = self._primary_admins([t.id for t in rows])
        return paginate([self.serialise(t, usage[t.id], admins) for t in rows], page.page, page.page_size, total)

    def admins(self, tenant_id: int) -> list[TenantAdminResponse]:
        tenant = self.get(tenant_id)
        rows = self.db.execute(
            select(User).where(
                User.tenant_id == tenant.id, User.role == Role.ADMIN.value, User.is_deleted.is_(False)
            ).order_by(User.id).execution_options(all_tenants=True)
        ).scalars().all()
        return [TenantAdminResponse.model_validate(u) for u in rows]

    def overview(self) -> dict:
        self._require(Permission.TENANT_VIEW)
        total = int(self.db.execute(select(func.count(Tenant.id))).scalar_one() or 0)
        by_status = dict(self.db.execute(select(Tenant.status, func.count(Tenant.id)).group_by(Tenant.status)).all())
        by_plan = dict(self.db.execute(select(Tenant.plan, func.count(Tenant.id)).group_by(Tenant.plan)).all())
        users = int(self.db.execute(
            select(func.count(User.id)).where(User.tenant_id.is_not(None), User.is_deleted.is_(False))
            .execution_options(all_tenants=True)
        ).scalar_one() or 0)
        recent = list(self.db.execute(select(Tenant).order_by(Tenant.created_at.desc(), Tenant.id.desc()).limit(5)).scalars())
        usage = self._usage([t.id for t in recent])
        admins = self._primary_admins([t.id for t in recent])
        return {
            "tenants": total,
            "active": int(by_status.get(TenantStatus.ACTIVE.value, 0)),
            "suspended": int(by_status.get(TenantStatus.SUSPENDED.value, 0)),
            "users": users,
            "plans": {k: int(v) for k, v in by_plan.items()},
            "recent": [self.serialise(t, usage[t.id], admins).model_dump() for t in recent],
        }

    # ---------------------------------------------------------------- commands
    def _unique_slug(self, wanted: str | None, name: str) -> str:
        base = wanted or slugify(name)
        if wanted:
            if self.db.execute(select(Tenant.id).where(Tenant.slug == wanted)).first():
                raise ConflictError(f"The slug '{wanted}' is already taken")
            return wanted
        slug, n = base, 2
        while slug in RESERVED_SLUGS or self.db.execute(select(Tenant.id).where(Tenant.slug == slug)).first():
            slug = f"{base[:44]}-{n}"
            n += 1
        return slug

    def _new_admin(self, tenant: Tenant, data: TenantAdminIn) -> User:
        from app.repositories.user_repository import UserRepository

        email = data.email.lower().strip()
        if UserRepository(self.db).get_by_email(email):
            raise ConflictError("A user with this e-mail already exists")
        password = initial_password(data.name, data.phone)
        user = User(
            name=data.name, email=email, phone=data.phone, role=Role.ADMIN.value,
            title="Administrator", status=UserStatus.ACTIVE.value,
            password_hash=hash_password(password), must_change_password=True,
            password_changed_at=utcnow(), tenant_id=tenant.id,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def create(self, payload: TenantCreate) -> TenantProvisioned:
        self._require(Permission.TENANT_MANAGE)
        tenant = Tenant(
            name=payload.name, slug=self._unique_slug(payload.slug, payload.name),
            plan=payload.plan.value, max_users=payload.max_users,
            contact_name=payload.contact_name, contact_email=payload.contact_email,
            contact_phone=payload.contact_phone, notes=payload.notes,
            status=TenantStatus.ACTIVE.value,
        )
        self.db.add(tenant)
        self.db.flush()
        admin = self._new_admin(tenant, payload.admin)
        self._audit(AuditAction.TENANT_CREATED, tenant, f"Created tenant {tenant.name} ({tenant.slug})",
                    after={"plan": tenant.plan, "max_users": tenant.max_users, "admin": admin.email})
        return TenantProvisioned(tenant=self.serialise(tenant), admin=TenantAdminResponse.model_validate(admin))

    def update(self, tenant_id: int, payload: TenantUpdate) -> Tenant:
        self._require(Permission.TENANT_MANAGE)
        tenant = self.get(tenant_id)
        values = payload.model_dump(exclude_unset=True)
        if "plan" in values and values["plan"] is not None:
            values["plan"] = payload.plan.value
        if values.get("max_users") is not None:
            used = self._usage([tenant.id])[tenant.id].get("users", 0)
            if values["max_users"] < used:
                raise BusinessRuleError(f"Seat limit cannot be below the {used} users already in this tenant")
        before = {k: getattr(tenant, k) for k in values}
        for key, value in values.items():
            if value is not None or key in {"contact_name", "contact_email", "contact_phone", "notes"}:
                setattr(tenant, key, value)
        self.db.flush()
        self._audit(AuditAction.TENANT_UPDATED, tenant, f"Updated tenant {tenant.name}", before=before, after=values)
        return tenant

    def suspend(self, tenant_id: int, reason: str) -> Tenant:
        self._require(Permission.TENANT_MANAGE)
        tenant = self.get(tenant_id)
        if tenant.status == TenantStatus.SUSPENDED.value:
            raise BusinessRuleError("This tenant is already suspended")
        tenant.status = TenantStatus.SUSPENDED.value
        tenant.suspended_at = utcnow()
        tenant.suspended_reason = reason
        # Kill every refresh session of the tenant's users; access tokens die on
        # their next request because the tenant gate rejects suspended tenants.
        user_ids = [u for (u,) in self.db.execute(
            select(User.id).where(User.tenant_id == tenant.id).execution_options(all_tenants=True)
        ).all()]
        if user_ids:
            from sqlalchemy import update as sa_update

            self.db.execute(
                sa_update(AuthToken).where(AuthToken.user_id.in_(user_ids), AuthToken.revoked_at.is_(None))
                .values(revoked_at=utcnow())
            )
        self.db.flush()
        self._audit(AuditAction.TENANT_SUSPENDED, tenant, f"Suspended tenant {tenant.name}: {reason}",
                    after={"status": tenant.status, "reason": reason})
        return tenant

    def activate(self, tenant_id: int) -> Tenant:
        self._require(Permission.TENANT_MANAGE)
        tenant = self.get(tenant_id)
        if tenant.status == TenantStatus.ACTIVE.value:
            raise BusinessRuleError("This tenant is already active")
        tenant.status = TenantStatus.ACTIVE.value
        tenant.suspended_at = None
        tenant.suspended_reason = None
        self.db.flush()
        self._audit(AuditAction.TENANT_ACTIVATED, tenant, f"Reactivated tenant {tenant.name}",
                    after={"status": tenant.status})
        return tenant

    def add_admin(self, tenant_id: int, data: TenantAdminIn) -> TenantProvisioned:
        self._require(Permission.TENANT_MANAGE)
        tenant = self.get(tenant_id)
        admin = self._new_admin(tenant, data)
        self._audit(AuditAction.TENANT_ADMIN_ADDED, tenant, f"Added admin {admin.email} to {tenant.name}",
                    after={"admin": admin.email})
        return TenantProvisioned(tenant=self.serialise(tenant), admin=TenantAdminResponse.model_validate(admin))

    def reset_admin_password(self, tenant_id: int, user_id: int) -> TenantProvisioned:
        self._require(Permission.TENANT_MANAGE)
        tenant = self.get(tenant_id)
        user = self.db.execute(
            select(User).where(User.id == user_id, User.tenant_id == tenant.id, User.role == Role.ADMIN.value)
            .execution_options(all_tenants=True)
        ).scalars().first()
        if user is None:
            raise NotFoundError("Admin not found in this tenant")
        user.password_hash = hash_password(initial_password(user.name, user.phone))
        user.must_change_password = True
        user.password_changed_at = utcnow()
        user.failed_login_attempts = 0
        user.locked_until = None
        if user.status == UserStatus.LOCKED.value:
            user.status = UserStatus.ACTIVE.value
        self.db.flush()
        self._audit(AuditAction.TENANT_UPDATED, tenant, f"Reset password for {user.email}",
                    after={"admin": user.email})
        return TenantProvisioned(tenant=self.serialise(tenant), admin=TenantAdminResponse.model_validate(user))

    # ------------------------------------------------------------------ helpers
    def _audit(self, action: AuditAction, tenant: Tenant, summary: str, *, before=None, after=None) -> None:
        self.audit.log(action=action, resource="tenant", resource_id=tenant.public_id, summary=summary,
                       actor=self.actor, before_state=before, after_state=after)
        # Tenant lifecycle changes (create / suspend / reactivate / admins) must be durable
        # *before* the response leaves: the request-scoped commit runs after the response is
        # sent, and a suspended tenant must be locked out on the very next request.
        self.db.commit()
