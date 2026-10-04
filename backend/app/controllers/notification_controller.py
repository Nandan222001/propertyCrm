"""Notification & follow-up queue endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.governance import NotificationCreate
from app.services.notification_service import NotificationService


def get_notification_service(db: DbDep, actor: ActorDep) -> NotificationService:
    return NotificationService(db, actor)


NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]


def queue(service: NotificationServiceDep) -> dict:
    """Role-scoped queue: staff see their role's alerts, customers their own."""
    return success([item.model_dump() for item in service.queue()], "Notification queue")


def list_notifications(page: PaginationDep, service: NotificationServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(n).model_dump() for n in result.items], meta=result.meta.model_dump())


def create_notification(payload: NotificationCreate, service: NotificationServiceDep) -> dict:
    notification = service.create_notification(payload)
    return success(service.serialise(notification).model_dump(), "Notification queued")


def mark_read(notification_id: int, service: NotificationServiceDep) -> dict:
    notification = service.mark_read(notification_id)
    return success({"id": notification.id, "is_read": True}, "Marked as read")


def take_action(notification_id: int, service: NotificationServiceDep) -> dict:
    notification = service.take_action(notification_id)
    return success({"id": notification.id, "actioned_at": str(notification.actioned_at)},
                   "Follow-up logged")


def delete_notification(notification_id: int, service: NotificationServiceDep) -> dict:
    service.delete(notification_id)
    return success(None, "Notification deleted")
