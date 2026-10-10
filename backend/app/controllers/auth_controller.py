"""Authentication endpoints (login, refresh, logout, registration, password)."""

from __future__ import annotations

from typing import Annotated

from fastapi import BackgroundTasks, Depends, Request, Response

from app.core.config import settings
from app.core.dependencies import ActorDep, CurrentUserDep, DbDep
from app.core.middleware import client_ip
from app.core.responses import success
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
)
from app.services.auth_service import AuthService
from app.services.mailer import reset_link, send_mail
from app.services.rbac_service import RBACService

COMMON_ERROR_RESPONSES = {
    401: {"description": "Invalid credentials or expired session"},
    403: {"description": "Authenticated but not permitted"},
    423: {"description": "Account locked"},
    429: {"description": "Too many requests"},
}


def get_auth_service(db: DbDep) -> AuthService:
    return AuthService(db)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def login(payload: LoginRequest, request: Request, response: Response, service: AuthServiceDep) -> dict:
    result = service.login(payload, ip=client_ip(request), user_agent=request.headers.get("user-agent"))
    # Auth responses must never be cached by browsers or intermediaries.
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    return success(result, "Signed in successfully")


def refresh(payload: RefreshRequest, request: Request, service: AuthServiceDep) -> dict:
    result = service.refresh(payload.refresh_token, ip=client_ip(request),
                             user_agent=request.headers.get("user-agent"))
    return success({"tokens": result}, "Session refreshed")


def logout(request: Request, actor: ActorDep, service: AuthServiceDep,
           payload: RefreshRequest | None = None) -> dict:
    service.logout(payload.refresh_token if payload else None, actor)
    return success(None, "Signed out")


def register(payload: RegisterRequest, request: Request, service: AuthServiceDep) -> dict:
    result = service.register(payload, ip=client_ip(request), user_agent=request.headers.get("user-agent"))
    return success(result, "Account request received — an administrator must activate it before you can sign in")


def me(user: CurrentUserDep, db: DbDep) -> dict:
    """Identity + effective permissions for the SPA's Redux auth slice."""
    service = AuthService(db)
    rbac = RBACService(db)
    session_user = service.session_user(user)
    return success(
        {
            "user": session_user.model_dump(),
            "permission_catalogue": rbac.permission_catalogue(),
            "policy": {
                "password_min_length": settings.PASSWORD_MIN_LENGTH,
                "access_token_minutes": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
                "refresh_token_days": settings.REFRESH_TOKEN_EXPIRE_DAYS,
                "pii_masked": settings.PII_MASK_BY_DEFAULT,
            },
        },
        "Current session",
    )


def change_password(payload: ChangePasswordRequest, actor: ActorDep, service: AuthServiceDep) -> dict:
    service.change_password(actor, payload)
    return success(None, "Password changed. Please sign in again on other devices.")


def forgot_password(payload: ForgotPasswordRequest, request: Request, service: AuthServiceDep,
                    background: BackgroundTasks) -> dict:
    token = service.request_password_reset(payload.email, ip=client_ip(request))
    if token:
        # Sent after the response so timing never reveals whether the address exists.
        background.add_task(
            send_mail, payload.email, "Reset your password",
            "We received a request to reset your password.\n\n"
            f"Open this link within 30 minutes to choose a new one:\n{reset_link(token)}\n\n"
            "If you did not ask for this, you can ignore this message.",
        )
    # Never reveal whether the address exists. In non-production the token is
    # also returned to make local testing possible.
    body: dict = {"delivery": "email"}
    if token and not settings.is_production:
        body["debug_token"] = token
    return success(body, "If the address exists, a reset link has been sent")


def reset_password(payload: ResetPasswordRequest, service: AuthServiceDep) -> dict:
    service.reset_password(payload.token, payload.new_password)
    return success(None, "Password updated. Please sign in.")
