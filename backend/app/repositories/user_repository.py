"""Repositories for identity, tokens and sign-in forensics."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select

from app.core.constants import UserStatus
from app.db.base import utcnow
from app.models.audit import LoginAttempt
from app.models.user import AuthToken, User, UserPermissionGrant
from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User
    searchable = ("name", "email", "phone", "agent_code")
    sortable = {
        "id": User.id,
        "name": User.name,
        "role": User.role,
        "status": User.status,
        "created_at": User.created_at,
        "last_login_at": User.last_login_at,
    }
    default_sort = "created_at"

    def get_by_email(self, email: str) -> User | None:
        """Case-insensitive lookup; emails are always stored lower-cased."""
        return self.get_by(email=(email or "").strip().lower())

    def active(self) -> list[User]:
        return self.list(filters={"status": UserStatus.ACTIVE.value})

    def count_by_role(self) -> dict[str, int]:
        rows = self.db.execute(
            select(User.role, func.count(User.id))
            .where(User.is_deleted == 0)
            .group_by(User.role)
        ).all()
        return {role: int(total) for role, total in rows}

    def register_failed_login(self, user: User, *, max_failures: int, lock_minutes: int) -> int:
        """Increment the counter and lock only when the threshold is reached."""
        from datetime import timedelta

        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if max_failures and user.failed_login_attempts >= max_failures and lock_minutes:
            user.locked_until = utcnow() + timedelta(minutes=lock_minutes)
            user.status = UserStatus.LOCKED.value if user.failed_login_attempts >= max_failures * 2 else user.status
        self.db.flush()
        return user.failed_login_attempts

    def register_successful_login(self, user: User, ip: str | None) -> None:
        user.failed_login_attempts = 0
        user.locked_until = None
        if user.status == UserStatus.LOCKED.value:
            user.status = UserStatus.ACTIVE.value
        user.last_login_at = utcnow()
        user.last_login_ip = ip
        self.db.flush()

    def anonymise(self, user: User) -> User:
        """GDPR/DPDP erasure: keep the row (FK integrity) but remove identifiers."""
        marker = user.id
        user.name = f"Erased user #{marker}"
        user.email = f"erased+{marker}@invalid.local"
        user.phone = None
        user.mfa_secret_encrypted = None
        # A sentinel that can never match a bcrypt hash: login is impossible.
        user.password_hash = "!"  # nosec B105
        user.data_anonymised_at = utcnow()
        user.status = UserStatus.SUSPENDED.value
        self.db.flush()
        return user


class UserPermissionGrantRepository(BaseRepository[UserPermissionGrant]):
    model = UserPermissionGrant
    sortable = {"id": UserPermissionGrant.id, "permission": UserPermissionGrant.permission}
    default_sort = "id"

    def for_user(self, user_id: int) -> list[UserPermissionGrant]:
        return self.list(filters={"user_id": user_id})

    def replace_for_user(self, user_id: int, grants: list[dict]) -> list[UserPermissionGrant]:
        """Declarative sync: desired state in, stored state out."""
        from sqlalchemy import delete

        self.db.execute(delete(UserPermissionGrant).where(UserPermissionGrant.user_id == user_id))
        created = [
            UserPermissionGrant(
                user_id=user_id,
                permission=item["permission"],
                granted=item.get("granted", True),
                granted_by=item.get("granted_by"),
                reason=item.get("reason"),
            )
            for item in grants
        ]
        return self.create_many(created)


class AuthTokenRepository(BaseRepository[AuthToken]):
    model = AuthToken
    sortable = {"id": AuthToken.id, "expires_at": AuthToken.expires_at}
    default_sort = "id"

    def get_by_digest(self, digest: str) -> AuthToken | None:
        return self.get_by(token_digest=digest)

    def revoke(self, token: AuthToken, *, rotated_to: str | None = None) -> None:
        token.revoked_at = utcnow()
        token.rotated_to = rotated_to
        self.db.flush()

    def revoke_all_for_user(self, user_id: int, *, purpose: str | None = None) -> int:
        from sqlalchemy import update

        stmt = update(AuthToken).where(
            AuthToken.user_id == user_id, AuthToken.revoked_at.is_(None)
        )
        if purpose:
            stmt = stmt.where(AuthToken.purpose == purpose)
        result = self.db.execute(stmt.values(revoked_at=utcnow()))
        return int(result.rowcount or 0)

    def purge_expired(self, before: datetime) -> int:
        from sqlalchemy import delete

        result = self.db.execute(delete(AuthToken).where(AuthToken.expires_at < before))
        return int(result.rowcount or 0)


class LoginAttemptRepository(BaseRepository[LoginAttempt]):
    model = LoginAttempt
    sortable = {"id": LoginAttempt.id, "occurred_at": LoginAttempt.occurred_at}
    default_sort = "occurred_at"

    def recent_failures(self, email_hash: str, since: datetime) -> int:
        return int(
            self.db.execute(
                select(func.count(LoginAttempt.id)).where(
                    LoginAttempt.email_hash == email_hash,
                    LoginAttempt.successful.is_(False),
                    LoginAttempt.occurred_at >= since,
                )
            ).scalar_one()
            or 0
        )

    def failures_from_ip(self, ip: str, since: datetime) -> int:
        return int(
            self.db.execute(
                select(func.count(LoginAttempt.id)).where(
                    LoginAttempt.ip_address == ip,
                    LoginAttempt.successful.is_(False),
                    LoginAttempt.occurred_at >= since,
                )
            ).scalar_one()
            or 0
        )
