"""Multi-tenant isolation, enforced once for the whole data layer.

How it works
------------
* A request (or script) *binds* its session to a tenant with :func:`set_scope`.
  ``get_current_user`` does this for every authenticated request, so by the time
  any route/service/repository runs, the session is already scoped.
* A ``do_orm_execute`` hook then appends ``tenant_id = <scope>`` to **every**
  SELECT / UPDATE / DELETE that touches a tenant-owned table — including joins,
  sub-queries, aggregates and lazily-loaded relationships. No repository writes
  a tenant filter by hand, so none can forget one.
* A ``before_flush`` hook stamps ``tenant_id`` on every new row and refuses to
  write a row that belongs to a different tenant (defence in depth).
* ``TenantScope(None)`` is the *platform* scope: it sees only rows with
  ``tenant_id IS NULL`` (platform accounts and platform audit entries) — never a
  tenant's business data.

Sessions with **no** scope are unfiltered. That is deliberate and limited to
pre-authentication lookups (e-mail → user), seeds/migrations, and platform
reporting that opts in per statement with ``execution_options(all_tenants=True)``.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import event, inspect, literal, select
from sqlalchemy.orm import Session, with_loader_criteria

from app.db.base import TENANT_SCOPED, Base

SCOPE_KEY = "tenant_scope"


class TenantIsolationError(RuntimeError):
    """A write tried to cross a tenant boundary."""


@dataclass(frozen=True, slots=True)
class TenantScope:
    #: Tenant the session is bound to; ``None`` = the platform (no tenant).
    tenant_id: int | None

    @property
    def is_platform(self) -> bool:
        return self.tenant_id is None


def set_scope(db: Session, tenant_id: int | None) -> TenantScope:
    scope = TenantScope(tenant_id)
    db.info[SCOPE_KEY] = scope
    return scope


def clear_scope(db: Session) -> None:
    db.info.pop(SCOPE_KEY, None)


def current_scope(db: Session) -> TenantScope | None:
    return db.info.get(SCOPE_KEY)


@event.listens_for(Session, "do_orm_execute")
def _apply_tenant_filter(state) -> None:
    scope: TenantScope | None = state.session.info.get(SCOPE_KEY)
    if scope is None or state.execution_options.get("all_tenants"):
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return

    tenant_id = scope.tenant_id
    if tenant_id is None:
        def criteria(cls):
            return cls.tenant_id.is_(None)
    else:
        def criteria(cls):
            return cls.tenant_id == tenant_id

    options = [
        with_loader_criteria(marker, criteria, include_aliases=True) for marker in TENANT_SCOPED
    ]
    state.statement = state.statement.options(*options)


def _scoped_models_by_table() -> dict[str, type]:
    return {
        mapper.local_table.name: mapper.class_
        for mapper in Base.registry.mappers
        if isinstance(mapper.class_, type) and issubclass(mapper.class_, TENANT_SCOPED)
    }


def _assert_references_stay_in_tenant(session: Session, obj, cache: dict) -> None:
    """Every foreign key to a tenant-owned table must resolve *inside* the scope.

    A request body can carry any ``*_id``; without this a tenant could attach its
    booking to another tenant's plot. The existence check runs through the normal
    session, so the tenant filter is applied to it automatically.
    """
    models = _scoped_models_by_table()
    state = inspect(obj)
    for column in obj.__table__.columns:
        if not column.foreign_keys:
            continue
        target = next(iter(column.foreign_keys)).column.table.name
        model = models.get(target)
        if model is None:
            continue
        attribute = obj.__mapper__.get_property_by_column(column).key
        value = getattr(obj, attribute, None)
        if value is None or (not state.transient and not state.pending
                             and not state.attrs[attribute].history.has_changes()):
            continue
        key = (target, value)
        if key not in cache:
            cache[key] = session.execute(
                select(literal(1)).select_from(model).where(model.id == value).limit(1)
            ).first() is not None
        if not cache[key]:
            raise TenantIsolationError(
                f"{type(obj).__name__}.{attribute} references {target} #{value}, "
                "which does not exist in this tenant"
            )


@event.listens_for(Session, "before_flush")
def _stamp_and_guard(session: Session, _flush_context, _instances) -> None:
    scope: TenantScope | None = session.info.get(SCOPE_KEY)
    if scope is None or scope.is_platform:
        return  # unscoped / platform sessions set tenant_id explicitly (provisioning)
    for obj in session.new:
        if not isinstance(obj, TENANT_SCOPED):
            continue
        if obj.tenant_id is None:
            obj.tenant_id = scope.tenant_id
        elif obj.tenant_id != scope.tenant_id:
            raise TenantIsolationError(
                f"{type(obj).__name__} belongs to tenant {obj.tenant_id}, "
                f"but this session is bound to tenant {scope.tenant_id}"
            )
    references: dict = {}
    for obj in session.new:
        if isinstance(obj, TENANT_SCOPED):
            _assert_references_stay_in_tenant(session, obj, references)
    for obj in session.dirty:
        if isinstance(obj, TENANT_SCOPED):
            if obj.tenant_id not in (None, scope.tenant_id):
                raise TenantIsolationError(
                    f"{type(obj).__name__} belongs to another tenant and cannot be modified"
                )
            _assert_references_stay_in_tenant(session, obj, references)
