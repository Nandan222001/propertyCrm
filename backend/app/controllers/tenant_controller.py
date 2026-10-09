"""Platform endpoints: tenant management and the platform overview."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.tenant import TenantAdminIn, TenantCreate, TenantSuspend, TenantUpdate
from app.services.tenant_service import TenantService


def get_tenant_service(db: DbDep, actor: ActorDep) -> TenantService:
    return TenantService(db, actor)


TenantServiceDep = Annotated[TenantService, Depends(get_tenant_service)]


def list_tenants(page: PaginationDep, service: TenantServiceDep, status: str | None = None) -> dict:
    result = service.paginate(page, status)
    return success([t.model_dump() for t in result.items], meta=result.meta.model_dump())


def create_tenant(payload: TenantCreate, service: TenantServiceDep) -> dict:
    return success(service.create(payload).model_dump(), "Tenant created")


def get_tenant(tenant_id: int, service: TenantServiceDep) -> dict:
    tenant = service.get(tenant_id)
    data = service.serialise(tenant).model_dump()
    data["admins"] = [a.model_dump() for a in service.admins(tenant_id)]
    return success(data)


def update_tenant(tenant_id: int, payload: TenantUpdate, service: TenantServiceDep) -> dict:
    return success(service.serialise(service.update(tenant_id, payload)).model_dump(), "Tenant updated")


def suspend_tenant(tenant_id: int, payload: TenantSuspend, service: TenantServiceDep) -> dict:
    return success(service.serialise(service.suspend(tenant_id, payload.reason)).model_dump(), "Tenant suspended")


def activate_tenant(tenant_id: int, service: TenantServiceDep) -> dict:
    return success(service.serialise(service.activate(tenant_id)).model_dump(), "Tenant reactivated")


def add_admin(tenant_id: int, payload: TenantAdminIn, service: TenantServiceDep) -> dict:
    return success(service.add_admin(tenant_id, payload).model_dump(), "Administrator added")


def reset_admin_password(tenant_id: int, user_id: int, service: TenantServiceDep) -> dict:
    return success(service.reset_admin_password(tenant_id, user_id).model_dump(), "Password reset")


def overview(service: TenantServiceDep) -> dict:
    return success(service.overview())
