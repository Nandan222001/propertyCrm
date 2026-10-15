"""``/auth`` routes — the public sign-in surface (strictly rate limited).

Every parameter is explicitly annotated: FastAPI treats untyped parameters as
query strings, so Request/Response and dependency types are always spelled out.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Request, Response

from app.controllers import auth_controller as controller
from app.core.dependencies import ActorDep, CurrentUserDep, DbDep
from app.schemas.auth import (
    ConfirmPasswordRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

AUTH_ERRORS = {
    401: {"description": "Invalid credentials or expired session"},
    423: {"description": "Account locked after repeated failures"},
    429: {"description": "Too many requests — rate limited"},
}


@router.post("/login", summary="Sign in and receive an access/refresh token pair",
             responses=AUTH_ERRORS)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    service: controller.AuthServiceDep,
) -> dict:
    return controller.login(payload, request, response, service)


@router.post("/refresh", summary="Rotate the refresh token and issue a new access token",
             responses=AUTH_ERRORS)
def refresh(payload: RefreshRequest, request: Request, service: controller.AuthServiceDep) -> dict:
    return controller.refresh(payload, request, service)


@router.post("/logout", summary="Revoke the refresh-token family")
def logout(
    request: Request,
    actor: ActorDep,
    service: controller.AuthServiceDep,
    payload: RefreshRequest | None = None,
) -> dict:
    return controller.logout(request, actor, service, payload)


@router.get("/me", summary="Current identity, effective permissions and security policy")
def me(user: CurrentUserDep, db: DbDep) -> dict:
    return controller.me(user, db)


@router.post("/password/confirm", summary="Re-enter your password before a sensitive action")
def confirm_password(payload: ConfirmPasswordRequest, actor: ActorDep, service: controller.AuthServiceDep) -> dict:
    return controller.confirm_password(payload, actor, service)


@router.post("/password/change", summary="Change password (revokes every session)")
def change_password(
    payload: ChangePasswordRequest, actor: ActorDep, service: controller.AuthServiceDep
) -> dict:
    return controller.change_password(payload, actor, service)


@router.post("/password/forgot", summary="Request a password-reset link",
             responses={429: {"description": "Rate limited"}})
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, service: controller.AuthServiceDep,
    background: BackgroundTasks,
) -> dict:
    return controller.forgot_password(payload, request, service, background)


@router.post("/password/reset", summary="Complete a password reset")
def reset_password(payload: ResetPasswordRequest, service: controller.AuthServiceDep) -> dict:
    return controller.reset_password(payload, service)
