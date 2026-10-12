"""Authentication & identity schemas (inputs are strict, outputs are minimal)."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.core.validators import validate_email, validate_password
from app.schemas.common import ORMModel, RequestModel


class LoginRequest(RequestModel):
    email: str = Field(max_length=254, examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=128, examples=["Demo@12345"])
    remember_me: bool = False
    mfa_code: str | None = Field(default=None, max_length=8)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("password")
    @classmethod
    def _password_shape(cls, value: str) -> str:
        # Login must not enforce strength (that would leak the policy to attackers
        # and block legacy passwords) — only reject empty/oversized input.
        if len(value) < 8:
            raise ValueError("password must be at least 8 characters")
        return value




class RefreshRequest(RequestModel):
    refresh_token: str = Field(min_length=20, max_length=512)


class ChangePasswordRequest(RequestModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _policy(cls, value: str) -> str:
        return validate_password(value)


class ForgotPasswordRequest(RequestModel):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return validate_email(value)


class ResetPasswordRequest(RequestModel):
    token: str = Field(min_length=20, max_length=512)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _policy(cls, value: str) -> str:
        return validate_password(value)


class TokenPair(ORMModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access-token lifetime in seconds")
    refresh_expires_in: int = Field(description="Refresh-token lifetime in seconds")


class SessionUser(ORMModel):
    """The identity payload the SPA keeps in Redux after sign-in."""

    id: int
    public_id: str
    name: str
    email: str
    role: str
    status: str
    title: str | None = None
    phone: str | None = None
    customer_id: int | None = None
    agent_code: str | None = None
    permissions: list[str] = Field(default_factory=list)
    last_login_at: datetime | None = None
    must_change_password: bool = False
    #: Organisation the user belongs to; ``None`` for platform (super admin) accounts.
    tenant_id: int | None = None
    tenant_name: str | None = None
    tenant_slug: str | None = None
    is_platform: bool = False


class LoginResponse(ORMModel):
    user: SessionUser
    tokens: TokenPair
    mfa_required: bool = False


class AuditTrailEntry(ORMModel):
    action: str
    occurred_at: datetime
    ip_address: str | None = None
    summary: str | None = None


class PasswordPolicyResponse(ORMModel):
    min_length: int
    requires_upper: bool = True
    requires_lower: bool = True
    requires_digit: bool = True
    requires_symbol: bool = True
    max_age_days: int = 180
