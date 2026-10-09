"""``/tenants`` and ``/platform`` — the multi-tenant control plane (platform admins only)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import tenant_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.tenant import TenantAdminIn, TenantCreate, TenantSuspend, TenantUpdate

router = APIRouter(tags=["Platform · Tenants"])

VIEW = Annotated[None, Depends(require(Permission.TENANT_VIEW))]
MANAGE = Annotated[None, Depends(require(Permission.TENANT_MANAGE))]


@router.get("/platform/overview", summary="Platform KPIs: tenants, users, plans")
def overview(service: controller.TenantServiceDep, _: VIEW = None):
    return controller.overview(service)


@router.get("/tenants", summary="List tenants")
def list_tenants(page: PaginationDep, service: controller.TenantServiceDep,
                 status_filter: str | None = None, _: VIEW = None):
    return controller.list_tenants(page, service, status_filter)


@router.post("/tenants", status_code=status.HTTP_201_CREATED, summary="Create a tenant with its first admin")
def create_tenant(payload: TenantCreate, service: controller.TenantServiceDep, _: MANAGE = None):
    return controller.create_tenant(payload, service)


@router.get("/tenants/{tenant_id}", summary="Tenant detail with usage and admins")
def get_tenant(tenant_id: int, service: controller.TenantServiceDep, _: VIEW = None):
    return controller.get_tenant(tenant_id, service)


@router.patch("/tenants/{tenant_id}", summary="Edit a tenant")
def update_tenant(tenant_id: int, payload: TenantUpdate, service: controller.TenantServiceDep, _: MANAGE = None):
    return controller.update_tenant(tenant_id, payload, service)


@router.post("/tenants/{tenant_id}/suspend", summary="Suspend a tenant (locks all its users out)")
def suspend_tenant(tenant_id: int, payload: TenantSuspend, service: controller.TenantServiceDep, _: MANAGE = None):
    return controller.suspend_tenant(tenant_id, payload, service)


@router.post("/tenants/{tenant_id}/activate", summary="Reactivate a suspended tenant")
def activate_tenant(tenant_id: int, service: controller.TenantServiceDep, _: MANAGE = None):
    return controller.activate_tenant(tenant_id, service)


@router.post("/tenants/{tenant_id}/admins", status_code=status.HTTP_201_CREATED, summary="Add a tenant administrator")
def add_admin(tenant_id: int, payload: TenantAdminIn, service: controller.TenantServiceDep, _: MANAGE = None):
    return controller.add_admin(tenant_id, payload, service)


@router.post("/tenants/{tenant_id}/admins/{user_id}/reset-password", summary="Issue a new one-time admin password")
def reset_admin_password(tenant_id: int, user_id: int, service: controller.TenantServiceDep, _: MANAGE = None):
    return controller.reset_admin_password(tenant_id, user_id, service)
