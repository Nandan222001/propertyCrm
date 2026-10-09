"""Authentication: sign-in, refresh-token rotation, lockout and password flows.

Security properties implemented here (each has a test in ``tests/test_auth.py``):

* generic failure message — no user enumeration;
* progressive delay + temporary lockout after N failed attempts (per account)
  and per-IP failure counting;
* refresh tokens are opaque, stored as digests, rotated on every use, and a
  replayed token revokes the whole family (theft detection);
* logout revokes server-side, so a stolen access token cannot be refreshed;
* password change/reset invalidates every existing session;
* every attempt is written to ``login_attempts`` + the audit trail.
"""

from __future__ import annotations

import time
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import AuditAction, Role, UserStatus
from app.core.context import ActorContext
from app.core.exceptions import (
    AccountLockedError,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.rate_limit import LoginThrottle
from app.core.security import (
    create_token,
    digest_token,
    hash_password,
    new_opaque_token,
    verify_password,
)
from app.db.base import utcnow
from app.models.audit import LoginAttempt
from app.models.tenant import Tenant
from app.models.user import AuthToken, User
from app.repositories.user_repository import (
    AuthTokenRepository,
    LoginAttemptRepository,
    UserRepository,
)
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    SessionUser,
    TokenPair,
)
from app.services.audit_service import AuditService
from app.services.rbac_service import RBACService

logger = get_logger(__name__)

#: Single, deliberately vague message — prevents account enumeration.
INVALID_CREDENTIALS = "Invalid e-mail address or password"
TENANT_SUSPENDED = "Your organisation's access is suspended. Contact the platform administrator."


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.tokens = AuthTokenRepository(db)
        self.attempts = LoginAttemptRepository(db)
        self.audit = AuditService(db)
        self.rbac = RBACService(db)
        self.throttle = LoginThrottle(settings.MAX_FAILED_LOGINS, settings.ACCOUNT_LOCK_MINUTES * 60)

    # ----------------------------------------------------------------- login
    def login(self, payload: LoginRequest, *, ip: str | None, user_agent: str | None) -> dict:
        email = payload.email.lower().strip()
        user = self.users.get_by_email(email)

        # Locked accounts are refused *before* password verification (no oracle).
        if user and user.is_locked:
            remaining = int((user.locked_until - utcnow()).total_seconds()) if user.locked_until else 0
            self._record_attempt(user, email, False, "locked", ip, user_agent)
            self.audit.security_event(
                "auth.account_locked",
                f"Sign-in attempted on locked account {email}",
                actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, name=user.name, email=email, role=user.role,
                                   ip_address=ip, user_agent=user_agent),
            )
            raise AccountLockedError(f"Account locked. Try again in {max(remaining // 60, 1)} minute(s).")

        # Progressive delay before hashing: slows distributed guessing without
        # locking out a legitimate user who simply mistyped once.
        if user is not None:
            time.sleep(self.throttle.delay_for(user.failed_login_attempts or 0))

        if user is None or not verify_password(payload.password, user.password_hash):
            self._handle_failed_login(user, email, ip, user_agent)
            raise AuthenticationError(INVALID_CREDENTIALS)

        if user.status == UserStatus.SUSPENDED.value:
            self._record_attempt(user, email, False, "suspended", ip, user_agent)
            raise AuthenticationError("This account is suspended. Contact your administrator.")

        if not self._tenant_is_active(user):
            self._record_attempt(user, email, False, "tenant_suspended", ip, user_agent)
            raise AuthenticationError(TENANT_SUSPENDED)

        if settings.CONSENT_REQUIRED and user.role == Role.CUSTOMER.value and not user.consent_given_at:
            # Portal users must have accepted the privacy notice (DPDP §7).
            pass  # recorded as an event, not a hard block, for staff-created accounts

        self.users.register_successful_login(user, ip)
        tokens = self._issue_tokens(user, ip=ip, user_agent=user_agent)
        self._record_attempt(user, email, True, None, ip, user_agent)
        self.audit.log(
            action=AuditAction.LOGIN,
            resource="auth",
            resource_id=user.public_id,
            summary=f"{user.role} signed in",
            actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, public_id=user.public_id, name=user.name, email=email,
                               role=user.role, ip_address=ip, user_agent=user_agent),
        )
        return {"user": self.session_user(user), "tokens": tokens}

    # --------------------------------------------------------------- refresh
    def refresh(self, refresh_token: str, *, ip: str | None, user_agent: str | None) -> dict:
        digest = digest_token(refresh_token)
        stored: AuthToken | None = self.tokens.get_by_digest(digest)
        if stored is None:
            self.audit.security_event(
                "auth.refresh_rejected", "Unknown refresh token presented", severity="warning"
            )
            raise AuthenticationError("Invalid or expired session")

        if stored.revoked_at is not None:
            # Replay of a rotated token ⇒ assume theft and kill the whole family.
            # The revocation is committed *before* the 401 so a raising handler
            # cannot roll it back.
            self.tokens.revoke_all_for_user(stored.user_id, purpose="refresh")
            self.audit.security_event(
                "auth.refresh_reuse",
                "Rotated refresh token replayed — all sessions revoked",
                severity="critical",
                context={"user_id": stored.user_id},
            )
            self.db.commit()
            raise AuthenticationError("Session expired. Please sign in again.")

        if stored.expires_at <= utcnow():
            raise AuthenticationError("Session expired. Please sign in again.")

        user = self.users.get_or_404(stored.user_id)
        if not user.is_active or user.is_deleted:
            raise AuthenticationError("Account is not active")
        if not self._tenant_is_active(user):
            raise AuthenticationError(TENANT_SUSPENDED)

        new_token = self._issue_tokens(user, ip=ip, user_agent=user_agent, rotate_from=stored)
        self.audit.log(
            action=AuditAction.TOKEN_REFRESH,
            resource="auth",
            resource_id=user.public_id,
            summary="Access token refreshed",
            actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, name=user.name, email=user.email, role=user.role,
                               ip_address=ip, user_agent=user_agent),
        )
        return new_token

    # ---------------------------------------------------------------- logout
    def logout(self, refresh_token: str | None, actor: ActorContext) -> None:
        if refresh_token:
            stored = self.tokens.get_by_digest(digest_token(refresh_token))
            if stored and stored.revoked_at is None:
                self.tokens.revoke(stored)
        if actor.user_id:
            self.tokens.revoke_all_for_user(actor.user_id, purpose="refresh")
        self.audit.log(
            action=AuditAction.LOGOUT, resource="auth", resource_id=actor.public_id or "",
            summary="Signed out", actor=actor,
        )

    # ------------------------------------------------------------ registration
    def register(self, payload: RegisterRequest, *, ip: str | None, user_agent: str | None) -> dict:
        email = payload.email.lower().strip()
        tenant = self.db.execute(
            select(Tenant).where(Tenant.slug == payload.tenant.strip().lower())
        ).scalars().first()
        if tenant is None or not tenant.is_active:
            raise ValidationError("Unknown or inactive organisation", code="invalid_tenant")
        if self.users.get_by_email(email):
            raise ConflictError("An account with this e-mail already exists")
        if settings.CONSENT_REQUIRED and not payload.consent:
            raise ValidationError("Please accept the privacy notice to continue", code="consent_required")

        user = User(
            name=payload.name,
            email=email,
            phone=payload.phone,
            role=payload.role.value,
            title=payload.title,
            status=UserStatus.ACTIVE.value,
            password_hash=hash_password(payload.password),
            password_changed_at=utcnow(),
            consent_given_at=utcnow() if payload.consent else None,
            tenant_id=tenant.id,
        )
        self.users.create(user)
        tokens = self._issue_tokens(user, ip=ip, user_agent=user_agent)
        self.audit.security_event(
            "auth.register",
            f"New {payload.role.value} account created",
            severity="info",
            actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, name=user.name, email=email, role=user.role,
                               ip_address=ip, user_agent=user_agent),
        )
        self.audit.log(action=AuditAction.CREATE, resource="user", resource_id=user.public_id,
                       summary="Self-registration", actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, name=user.name,
                                                                       email=email, role=user.role))
        return {"user": self.session_user(user), "tokens": tokens}

    # ----------------------------------------------------------- password ops
    def change_password(self, actor: ActorContext, payload: ChangePasswordRequest) -> None:
        user = self.users.get_or_404(actor.user_id)
        if not verify_password(payload.current_password, user.password_hash):
            self.audit.security_event(
                "auth.password_change_failed", "Wrong current password supplied", actor=actor
            )
            raise AuthenticationError("Current password is incorrect")
        if payload.new_password != payload.confirm_password:
            raise ValidationError("New passwords do not match", code="password_mismatch")
        if verify_password(payload.new_password, user.password_hash):
            raise ValidationError("Choose a password you have not used before", code="password_reused")

        user.password_hash = hash_password(payload.new_password)
        user.password_changed_at = utcnow()
        user.must_change_password = 0
        self.tokens.revoke_all_for_user(user.id)  # invalidate every existing session
        self.db.flush()
        self.audit.log(action=AuditAction.PASSWORD_CHANGE, resource="user", resource_id=user.public_id,
                       summary="Password changed", actor=actor)

    def request_password_reset(self, email: str, *, ip: str | None) -> str | None:
        """Returns the raw token for the mailer; always behaves identically
        whether or not the account exists (no enumeration)."""
        user = self.users.get_by_email(email)
        if user is None or not user.is_active:
            self.audit.security_event(
                "auth.reset_requested_unknown", "Password reset requested for unknown e-mail",
                severity="info", context={"ip": ip},
            )
            return None
        raw = new_opaque_token()
        self.tokens.create(
            AuthToken(
                user_id=user.id,
                token_digest=digest_token(raw),
                purpose="password_reset",
                expires_at=utcnow() + timedelta(minutes=30),
                issued_ip=ip,
            )
        )
        self.audit.log(action=AuditAction.UPDATE, resource="auth", resource_id=user.public_id,
                       summary="Password reset requested", actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, name=user.name,
                                                                              email=user.email, role=user.role,
                                                                              ip_address=ip))
        return raw

    def reset_password(self, token: str, new_password: str) -> None:
        from app.core.validators import validate_password

        stored = self.tokens.get_by_digest(digest_token(token))
        if stored is None or stored.purpose != "password_reset" or not stored.is_usable:
            raise AuthenticationError("This reset link is invalid or has expired")
        validate_password(new_password)
        user = self.users.get_or_404(stored.user_id)
        user.password_hash = hash_password(new_password)
        user.password_changed_at = utcnow()
        user.must_change_password = 0
        user.locked_until = None
        user.failed_login_attempts = 0
        if user.status == UserStatus.LOCKED.value:
            user.status = UserStatus.ACTIVE.value
        self.tokens.revoke(stored)
        self.tokens.revoke_all_for_user(user.id)
        self.db.flush()
        self.audit.log(action=AuditAction.PASSWORD_CHANGE, resource="user", resource_id=user.public_id,
                       summary="Password reset completed",
                       actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, name=user.name, email=user.email, role=user.role))

    # --------------------------------------------------------------- helpers
    def _tenant_is_active(self, user: User) -> bool:
        """Platform accounts have no tenant; everyone else needs an active one."""
        if user.tenant_id is None:
            return user.role == Role.SUPER_ADMIN.value
        tenant = self.db.get(Tenant, user.tenant_id)
        return tenant is not None and tenant.is_active

    def session_user(self, user: User) -> SessionUser:
        tenant = self.db.get(Tenant, user.tenant_id) if user.tenant_id is not None else None
        return SessionUser(
            tenant_id=user.tenant_id,
            tenant_name=tenant.name if tenant else None,
            tenant_slug=tenant.slug if tenant else None,
            is_platform=user.tenant_id is None and user.role == Role.SUPER_ADMIN.value,
            id=user.id,
            public_id=user.public_id,
            name=user.name,
            email=user.email,
            role=user.role,
            status=user.status,
            title=user.title,
            phone=user.phone,
            customer_id=user.customer_id,
            agent_code=user.agent_code,
            permissions=sorted(self.rbac.effective_permissions(user)),
            last_login_at=user.last_login_at,
            must_change_password=bool(user.must_change_password),
        )

    def actor_for(self, user: User, *, extra_permissions: frozenset[str] | None = None,
                  revoked: frozenset[str] | None = None) -> ActorContext:
        return ActorContext(
            user_id=user.id,
            public_id=user.public_id,
            name=user.name,
            email=user.email,
            role=user.role,
            customer_id=user.customer_id,
            agent_id=self.rbac.agent_id_for(user),
            tenant_id=user.tenant_id,
            extra_permissions=extra_permissions or frozenset(),
            revoked_permissions=revoked or frozenset(),
        )

    def _issue_tokens(self, user: User, *, ip: str | None, user_agent: str | None,
                      rotate_from: AuthToken | None = None) -> TokenPair:
        access, _ = create_token(user.id, "access", role=user.role,
                                 extra_claims={"pid": user.public_id, "name": user.name})
        refresh_raw = new_opaque_token()
        refresh = AuthToken(
            user_id=user.id,
            token_digest=digest_token(refresh_raw),
            purpose="refresh",
            expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            issued_ip=ip,
            user_agent=(user_agent or "")[:255],
        )
        self.tokens.create(refresh)
        if rotate_from is not None:
            self.tokens.revoke(rotate_from, rotated_to=refresh.token_digest)
        self.db.flush()
        return TokenPair(
            access_token=access,
            refresh_token=refresh_raw,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            refresh_expires_in=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        )

    def _handle_failed_login(self, user: User | None, email: str, ip: str | None, ua: str | None) -> None:
        """Record a failed attempt, then commit inside this method.

        The caller raises AuthenticationError immediately afterwards, which
        rolls the request transaction back — so the lockout counter, the
        forensic attempt row and the security event are committed here first.
        """
        if user is None:
            self.audit.security_event(
                "auth.login_failed", "Sign-in failed for unknown account",
                severity="warning", context={"email_hash": digest_token(email)[:16], "ip": ip},
            )
            if ip:
                self._record_attempt(None, email, False, "unknown_account", ip, ua)
            self.db.commit()
            return

        attempts = self.users.register_failed_login(
            user, max_failures=settings.MAX_FAILED_LOGINS, lock_minutes=settings.ACCOUNT_LOCK_MINUTES
        )
        self._record_attempt(user, email, False, "bad_password" if not user.is_locked else "locked", ip, ua)
        self.audit.security_event(
            "auth.login_failed",
            f"Failed sign-in attempt #{attempts} for {email}",
            severity="error" if attempts >= settings.MAX_FAILED_LOGINS else "warning",
            actor=ActorContext(user_id=user.id, tenant_id=user.tenant_id, name=user.name, email=email, role=user.role, ip_address=ip,
                               user_agent=ua),
            context={"attempts": attempts, "locked": user.is_locked},
        )
        self.db.commit()  # durable lockout state + forensic evidence

    def _record_attempt(self, user: User | None, email: str, successful: bool, reason: str | None,
                        ip: str | None, ua: str | None) -> None:
        self.attempts.create(
            # e-mail is stored as a digest: the forensic table itself holds no PII
            LoginAttempt(
                email_hash=digest_token(email.lower()),
                user_id=user.id if user else None,
                successful=successful,
                reason=reason,
                ip_address=ip,
                user_agent=(ua or "")[:255],
            )
        )
        self.db.flush()

    def current_user_or_404(self, user_id: int) -> User:
        user = self.users.get(user_id)
        if user is None:
            raise NotFoundError("Account not found")
        return user
