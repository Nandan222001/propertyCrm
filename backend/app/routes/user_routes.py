"""``/users`` and ``/roles`` routes — identity governance (RBAC protected)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.controllers import user_controller as controller
from app.core.constants import Permission
from app.core.dependencies import DbDep, PaginationDep, require
from app.schemas.governance import PermissionGrantRequest, UserCreate, UserUpdate

router = APIRouter(tags=["Identity & RBAC"])

VIEW = Annotated[None, Depends(require(Permission.USER_VIEW))]
MANAGE = Annotated[None, Depends(require(Permission.USER_MANAGE))]


@router.get("/users", summary="List user accounts")
def list_users(page: PaginationDep, service: controller.UserServiceDep, _: VIEW = None):
    return controller.list_users(page, service)


@router.post("/users", status_code=status.HTTP_201_CREATED, summary="Provision a user account")
def create_user(payload: UserCreate, service: controller.UserServiceDep, _: MANAGE = None):
    return controller.create_user(payload, service)


@router.get("/users/{user_id}", summary="Get a user account")
def get_user(user_id: int, service: controller.UserServiceDep, _: VIEW = None):
    return controller.get_user(user_id, service)


@router.patch("/users/{user_id}", summary="Update a user account")
def update_user(user_id: int, payload: UserUpdate, service: controller.UserServiceDep, _: MANAGE = None):
    return controller.update_user(user_id, payload, service)


@router.post("/users/{user_id}/suspend", summary="Suspend an account")
def suspend_user(
    user_id: int,
    service: controller.UserServiceDep,
    reason: str = Query(default="", max_length=255),
    _: MANAGE = None,
):
    return controller.suspend_user(user_id, service, reason)


@router.post("/users/{user_id}/unlock", summary="Clear lockout counters")
def unlock_user(user_id: int, service: controller.UserServiceDep, _: MANAGE = None):
    return controller.unlock_user(user_id, service)


@router.delete("/users/{user_id}", summary="Soft-delete an account")
def delete_user(user_id: int, service: controller.UserServiceDep, _: MANAGE = None):
    return controller.delete_user(user_id, service)


@router.put("/users/{user_id}/permissions",
            summary="Replace per-user permission overrides (super admin only)")
def set_permissions(
    user_id: int,
    payload: PermissionGrantRequest,
    service: controller.UserServiceDep,
    _: MANAGE = None,
):
    return controller.set_grants(user_id, payload, service)


@router.get("/roles/matrix", summary="Role → permission matrix and permission catalogue")
def role_matrix(db: DbDep, _: VIEW = None):
    return controller.role_matrix(db)
