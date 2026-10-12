"""User & role administration endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.governance import (
    PermissionGrantRequest,
    UserCreate,
    UserUpdate,
)
from app.services.rbac_service import RBACService
from app.services.user_service import UserService


def get_user_service(db: DbDep, actor: ActorDep) -> UserService:
    return UserService(db, actor)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]


def list_users(page: PaginationDep, service: UserServiceDep) -> dict:
    result = service.paginate(page)
    return success(
        [service.serialise(user).model_dump() for user in result.items],
        meta=result.meta.model_dump(),
    )


def create_user(payload: UserCreate, service: UserServiceDep) -> dict:
    user = service.create_user(payload)
    return success(service.serialise(user).model_dump(), "Team member provisioned")


def get_user(user_id: int, service: UserServiceDep) -> dict:
    user = service.get(user_id)
    return success(service.serialise(user).model_dump())


def update_user(user_id: int, payload: UserUpdate, service: UserServiceDep) -> dict:
    user = service.update_user(user_id, payload)
    return success(service.serialise(user).model_dump(), "Account updated")


def suspend_user(user_id: int, service: UserServiceDep, reason: str = Query(max_length=255, default="")) -> dict:
    user = service.suspend(user_id, reason=reason)
    return success(service.serialise(user).model_dump(), "Account suspended")


def unlock_user(user_id: int, service: UserServiceDep) -> dict:
    user = service.unlock(user_id)
    return success(service.serialise(user).model_dump(), "Account unlocked")


def reset_user_password(user_id: int, service: UserServiceDep) -> dict:
    service.reset_password(user_id)
    return success(None, "Password reset to the starting password — the user must change it at next sign-in")


def delete_user(user_id: int, service: UserServiceDep) -> dict:
    service.delete_user(user_id)
    return success(None, "Account deleted")


def set_grants(user_id: int, payload: PermissionGrantRequest, service: UserServiceDep) -> dict:
    applied = service.set_permission_grants(user_id, [grant.model_dump() for grant in payload.grants])
    return success(applied, "Permission grants updated")


def role_matrix(db: DbDep) -> dict:
    rbac = RBACService(db)
    return success(
        {"roles": rbac.matrix(), "permissions": rbac.permission_catalogue()},
        "Role & permission catalogue",
    )
