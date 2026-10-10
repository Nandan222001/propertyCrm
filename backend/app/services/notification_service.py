"""Follow-up queue, alerts and settings services."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.constants import AuditAction, Permission
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import PermissionDeniedError
from app.core.responses import Paginated
from app.models.audit import AppSetting, Notification
from app.repositories.governance_repository import AppSettingRepository, NotificationRepository
from app.schemas.governance import (
    NotificationCreate,
    NotificationResponse,
    SettingResponse,
    SettingUpdate,
)
from app.services.base_service import BaseService

SECRET_SETTING_HINTS = ("secret", "password", "token", "key", "webhook")


class NotificationService(BaseService[Notification]):
    resource = "notification"
    repository_class = NotificationRepository
    permissions = {
        "view": Permission.NOTIFICATION_VIEW,
        "create": Permission.NOTIFICATION_MANAGE,
        "update": Permission.NOTIFICATION_VIEW,
        "delete": Permission.NOTIFICATION_MANAGE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.notifications: NotificationRepository = self.repository  # type: ignore[assignment]

    def serialise(self, notification: Notification) -> NotificationResponse:
        return NotificationResponse(
            id=notification.id,
            public_id=notification.public_id,
            title=notification.title,
            body=notification.body,
            category=notification.category,
            severity=notification.severity,
            audience_role=notification.audience_role,
            is_read=notification.is_read,
            actioned_at=notification.actioned_at,
            due_at=notification.due_at,
            created_at=notification.created_at,
            updated_at=notification.updated_at,
        )

    def queue(self) -> list[NotificationResponse]:
        self._authorise("view")
        items = self.notifications.for_audience(
            role=self.actor.role,
            user_id=self.actor.user_id,
            customer_id=self.actor.customer_id,
        )
        return [self.serialise(item) for item in items]

    def paginate(self, page: PaginationContext) -> Paginated[Notification]:
        return self.list(page)

    def create_notification(self, payload: NotificationCreate) -> Notification:
        self._authorise("create")
        notification = Notification(**payload.model_dump(exclude_none=True))
        self.notifications.create(notification)
        self._audit(AuditAction.CREATE, notification, summary=f"Notification '{notification.title}'")
        return notification

    def _own(self, notification_id: int) -> Notification:
        """Fetch a notification only if it is in *this* actor's queue (404/403 otherwise)."""
        notification = self.notifications.get_or_404(notification_id)
        if not self.notifications.is_visible(
            notification_id, role=self.actor.role, user_id=self.actor.user_id,
            customer_id=self.actor.customer_id,
        ):
            raise PermissionDeniedError("This notification is not addressed to you")
        return notification

    def mark_read(self, notification_id: int) -> Notification:
        notification = self._own(notification_id)
        self.notifications.mark_read(notification)
        return notification

    def take_action(self, notification_id: int) -> Notification:
        self._authorise("update")
        notification = self._own(notification_id)
        self.notifications.mark_actioned(notification, self.actor.name)
        self._audit(AuditAction.UPDATE, notification, summary="Follow-up actioned")
        return notification

    def seed_from_overdue(self, payments: list) -> int:
        """Turn overdue ledger rows into follow-up tasks (called by the scheduler)."""
        created = 0
        for payment in payments:
            booking = payment.booking
            if booking is None:
                continue
            existing = self.notifications.get_by(booking_id=booking.id, category="PAYMENT_OVERDUE")
            if existing:
                continue
            self.notifications.create(
                Notification(
                    title=f"Payment overdue · {booking.booking_number}",
                    body=f"₹{payment.amount} overdue since {payment.due_date}",
                    category="PAYMENT_OVERDUE",
                    severity="warning",
                    audience_role="ACCOUNTS",
                    customer_id=payment.customer_id,
                    booking_id=booking.id,
                    due_at=self.notifications.now(),
                )
            )
            created += 1
        self.db.flush()
        return created


def agent_user_id(db: Session, agent) -> int | None:
    """The login behind an agent record: linked directly, or by the agent code on the user."""
    if agent is None:
        return None
    if agent.user_id:
        return agent.user_id
    from sqlalchemy import select

    from app.core.constants import Role
    from app.models.user import User

    return db.execute(
        select(User.id).where(User.role == Role.SALES_AGENT.value, User.agent_code == agent.code)
    ).scalars().first()


def emit(
    db: Session, *, title: str, body: str | None = None, category: str = "FOLLOW_UP",
    severity: str = "info", audience_role: str | None = None, user_id: int | None = None,
    customer_id: int | None = None, booking_id: int | None = None,
) -> Notification | None:
    """Queue a notification for exactly one audience (a role, or one user).

    Workflow events call this so the right people hear about them and nobody else:
    pass ``user_id`` for a person, ``audience_role`` for everyone holding that role.
    The tenant is stamped automatically on flush, so queues never cross organisations.
    """
    if audience_role is None and user_id is None and customer_id is None:
        return None
    notification = Notification(
        title=title, body=body, category=category, severity=severity,
        audience_role=audience_role, user_id=user_id, customer_id=customer_id, booking_id=booking_id,
    )
    db.add(notification)
    db.flush()
    return notification


class SettingService(BaseService[AppSetting]):
    resource = "setting"
    repository_class = AppSettingRepository
    permissions = {
        "view": Permission.SETTINGS_MANAGE,
        "create": Permission.SETTINGS_MANAGE,
        "update": Permission.SETTINGS_MANAGE,
        "delete": Permission.SETTINGS_MANAGE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.settings: AppSettingRepository = self.repository  # type: ignore[assignment]

    def serialise(self, setting: AppSetting) -> SettingResponse:
        """Secret-looking keys never leave the API in clear text."""
        is_secret = setting.is_secret or any(hint in setting.key.lower() for hint in SECRET_SETTING_HINTS)
        return SettingResponse(
            id=setting.id,
            key=setting.key,
            value="***" if (is_secret and setting.value) else setting.value,
            value_type=setting.value_type,
            category=setting.category,
            is_secret=is_secret,
            description=setting.description,
            updated_by_id=setting.updated_by_id,
            created_at=setting.created_at,
            updated_at=setting.updated_at,
        )

    def grouped(self) -> dict[str, list[SettingResponse]]:
        self._authorise("view")
        return {
            category: [self.serialise(item) for item in items]
            for category, items in self.settings.by_category().items()
        }

    def update_setting(self, key: str, payload: SettingUpdate) -> AppSetting:
        self._authorise("update")
        setting = self.settings.upsert(
            key, payload.value, description=payload.description, updated_by_id=self.actor.user_id
        )
        self._audit(AuditAction.CONFIG_CHANGE, setting, summary=f"Setting '{key}' updated")
        return setting

    def get_value(self, key: str, default: str | None = None) -> str | None:
        setting = self.settings.get_by_key(key)
        return setting.value if setting and setting.value is not None else default
