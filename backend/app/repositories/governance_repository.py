"""Append-only governance repositories: audit, security events, notifications."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select

from app.models.audit import AppSetting, AuditLog, Notification, SecurityEvent
from app.repositories.base_repository import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    model = AuditLog
    searchable = ("action", "resource", "resource_id", "summary", "actor_label")
    sortable = {"id": AuditLog.id, "occurred_at": AuditLog.occurred_at, "action": AuditLog.action}
    default_sort = "occurred_at"

    def record(self, **values) -> AuditLog:
        return self.create(AuditLog(**values))

    def for_resource(self, resource: str, resource_id: str) -> list[AuditLog]:
        return self.list(filters={"resource": resource, "resource_id": resource_id}, sort="occurred_at:desc")

    def for_actor(self, actor_id: int) -> list[AuditLog]:
        return self.list(filters={"actor_id": actor_id}, sort="occurred_at:desc")

    def action_histogram(self, since: datetime) -> dict[str, int]:
        rows = self.db.execute(
            select(AuditLog.action, func.count(AuditLog.id))
            .where(AuditLog.occurred_at >= since)
            .group_by(AuditLog.action)
        ).all()
        return {str(action): int(total) for action, total in rows}

    def purge_before(self, cutoff: datetime) -> int:
        from sqlalchemy import delete

        result = self.db.execute(delete(AuditLog).where(AuditLog.occurred_at < cutoff))
        return int(result.rowcount or 0)


class SecurityEventRepository(BaseRepository[SecurityEvent]):
    model = SecurityEvent
    searchable = ("event", "message", "actor_label")
    sortable = {"id": SecurityEvent.id, "created_at": SecurityEvent.created_at, "severity": SecurityEvent.severity}
    default_sort = "created_at"

    def record(self, **values) -> SecurityEvent:
        return self.create(SecurityEvent(**values))

    def unacknowledged(self, minimum_severity: str = "warning") -> list[SecurityEvent]:
        order = {"info": 0, "warning": 1, "error": 2, "critical": 3}
        threshold = order.get(minimum_severity, 1)
        events = self.list(filters={"acknowledged_at": None}, sort="created_at:desc", limit=200)
        return [event for event in events if order.get(event.severity, 1) >= threshold]

    def count_since(self, event: str, since: datetime) -> int:
        return int(
            self.db.execute(
                select(func.count(SecurityEvent.id)).where(
                    SecurityEvent.event == event, SecurityEvent.created_at >= since
                )
            ).scalar_one()
            or 0
        )


class NotificationRepository(BaseRepository[Notification]):
    model = Notification
    searchable = ("title", "body", "category")
    sortable = {"id": Notification.id, "created_at": Notification.created_at, "due_at": Notification.due_at}
    default_sort = "created_at"

    @staticmethod
    def visible_to(*, role: str | None, user_id: int | None, customer_id: int | None):
        """SQL predicate: what one actor may see. Pure function of the caller's identity.

        * a notification addressed to a *user* is visible to that user only;
        * a role notification (no user) is visible to staff of that role;
        * a customer's own notification (no user, audience none/CUSTOMER) is visible to
          that customer — never because of a role match.
        """
        from sqlalchemy import and_, or_

        clauses = []
        if user_id:
            clauses.append(Notification.user_id == user_id)
        if customer_id:
            clauses.append(and_(
                Notification.user_id.is_(None),
                Notification.customer_id == customer_id,
                or_(Notification.audience_role.is_(None), Notification.audience_role == "CUSTOMER"),
            ))
        elif role:
            clauses.append(and_(Notification.user_id.is_(None), Notification.audience_role == role))
        return or_(*clauses) if clauses else None

    def for_audience(self, *, role: str | None, user_id: int | None, customer_id: int | None) -> list[Notification]:
        """Role queue + personal queue, unread first then newest (one query, no duplicates)."""
        visible = self.visible_to(role=role, user_id=user_id, customer_id=customer_id)
        if visible is None:
            return []
        stmt = (
            select(Notification)
            .where(visible)
            .order_by(Notification.is_read.asc(), Notification.created_at.desc())
            .limit(200)
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def is_visible(self, notification_id: int, *, role: str | None, user_id: int | None,
                   customer_id: int | None) -> bool:
        visible = self.visible_to(role=role, user_id=user_id, customer_id=customer_id)
        if visible is None:
            return False
        stmt = select(Notification.id).where(
            Notification.id == notification_id, visible
        )
        return self.db.execute(stmt).first() is not None

    def mark_read(self, notification: Notification) -> Notification:
        notification.is_read = True
        self.db.flush()
        return notification

    def mark_actioned(self, notification: Notification, actor: str) -> Notification:
        from app.db.base import utcnow

        notification.actioned_at = utcnow()
        notification.actioned_by = actor
        notification.is_read = True
        self.db.flush()
        return notification


class AppSettingRepository(BaseRepository[AppSetting]):
    model = AppSetting
    searchable = ("key", "category", "description")
    sortable = {"id": AppSetting.id, "key": AppSetting.key, "category": AppSetting.category}
    default_sort = "key"

    def get_by_key(self, key: str) -> AppSetting | None:
        return self.get_by(key=key)

    def upsert(self, key: str, value: str, *, category: str = "general",
               value_type: str = "string", description: str | None = None,
               updated_by_id: int | None = None) -> AppSetting:
        setting = self.get_by_key(key)
        if setting is None:
            setting = AppSetting(key=key, value=value, category=category,
                                 value_type=value_type, description=description,
                                 updated_by_id=updated_by_id)
            return self.create(setting)
        setting.value = value
        setting.updated_by_id = updated_by_id
        self.db.flush()
        return setting

    def by_category(self) -> dict[str, list[AppSetting]]:
        grouped: dict[str, list[AppSetting]] = {}
        ordered = self.list(sort="id:asc")
        for item in ordered:
            grouped.setdefault(item.category, []).append(item)
        return grouped
