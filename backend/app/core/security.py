"""Cryptographic helpers: password hashing, JWT issuing/verification, digests.

Design notes
------------
* Passwords are hashed with bcrypt (``passlib``) and are **never** logged,
  returned or stored in plain form. A password policy validator lives in
  ``core.validators``.
* Access tokens are short lived JWTs; refresh tokens are opaque random strings
  whose SHA-256 digest is stored in the database so a leaked table cannot be
  replayed (rotation + reuse detection in ``services.auth_service``).
* ``blind_index`` produces deterministic HMAC-SHA256 digests used to look up
  encrypted PII columns (e-mail / phone) without storing them in clear text.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from jwt import InvalidTokenError as JWTError
from passlib.context import CryptContext

from app.core.config import settings

TokenType = Literal["access", "refresh", "password_reset", "mfa_challenge"]

_pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=settings.PASSWORD_HASH_ROUNDS,
)


# ---------------------------------------------------------------- passwords
def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash. bcrypt truncates at 72 bytes — enforced upstream."""
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Constant-time verification that never raises on malformed hashes."""
    try:
        return _pwd_context.verify(plain_password, password_hash)
    except ValueError:
        return False


def needs_rehash(password_hash: str) -> bool:
    return _pwd_context.needs_update(password_hash)


# ------------------------------------------------------------------- tokens
def _now() -> datetime:
    return datetime.now(UTC)


def create_token(
    subject: str | int,
    token_type: TokenType = "access",  # noqa: S107 - token *kind*, not a password
    *,
    role: str | None = None,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> tuple[str, datetime]:
    """Create a signed JWT and return ``(token, expires_at)``."""
    if expires_delta is None:
        expires_delta = (
            timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            if token_type == "access"
            else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        )
    issued_at = _now()
    expires_at = issued_at + expires_delta
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": int(issued_at.timestamp()),
        "nbf": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": uuid.uuid4().hex,
        "iss": settings.APP_NAME,
        "aud": "lalita-erp-client",
    }
    if role:
        payload["role"] = role
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM), expires_at


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    """Verify signature/claims. Raises :class:`JWTError` on any problem.

    PyJWT (not python-jose): actively maintained, backed by `cryptography`, and
    it has no `ecdsa`/`rsa`/`pyasn1` transitive dependencies to keep patching.
    """
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],  # pinned: prevents "alg: none" downgrade
        audience="lalita-erp-client",
        issuer=settings.APP_NAME,
        options={"require": ["exp", "sub", "iat"], "verify_aud": True, "verify_iss": True},
    )
    if expected_type and payload.get("type") != expected_type:
        raise JWTError(f"expected {expected_type} token")
    return payload


def new_opaque_token() -> str:
    """64-char URL-safe refresh token with full 256-bit entropy."""
    return secrets.token_urlsafe(48)


def digest_token(token: str) -> str:
    """Store only digests; the pepper keeps dumps useless without the secret."""
    return hmac.new(
        settings.INDEX_PEPPER.encode(), token.encode(), hashlib.sha256
    ).hexdigest()


# ------------------------------------------------------- deterministic lookup
def blind_index(value: str) -> str:
    """Deterministic digest for encrypted-column lookups (e-mail/phone search)."""
    normalised = (value or "").strip().lower()
    return hmac.new(
        settings.INDEX_PEPPER.encode(), normalised.encode(), hashlib.sha256
    ).hexdigest()


def constant_time_compare(left: str, right: str) -> bool:
    return hmac.compare_digest(left or "", right or "")
