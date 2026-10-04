"""Notification / follow-up queue routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import notification_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.governance import NotificationCreate

router = APIRouter(prefix="/notifications", tags=["Notifications"])

VIEW = Annotated[None, Depends(require(Permission.NOTIFICATION_VIEW))]
MANAGE = Annotated[None, Depends(require(Permission.NOTIFICATION_MANAGE))]


@router.get("", summary="Role-scoped notification queue")
def queue(service: controller.NotificationServiceDep, _: VIEW = None):
    return controller.queue(service)


@router.get("/all", summary="Paginated notification history")
def list_notifications(page: PaginationDep, service: controller.NotificationServiceDep, _: MANAGE = None):
    return controller.list_notifications(page, service)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Queue a notification")
def create_notification(payload: NotificationCreate, service: controller.NotificationServiceDep,
                        _: MANAGE = None):
    return controller.create_notification(payload, service)


@router.post("/{notification_id}/read", summary="Mark as read")
def mark_read(notification_id: int, service: controller.NotificationServiceDep, _: VIEW = None):
    return controller.mark_read(notification_id, service)


@router.post("/{notification_id}/action", summary="Log the follow-up action")
def take_action(notification_id: int, service: controller.NotificationServiceDep, _: VIEW = None):
    return controller.take_action(notification_id, service)


@router.delete("/{notification_id}", summary="Soft-delete a notification")
def delete_notification(notification_id: int, service: controller.NotificationServiceDep,
                        _: MANAGE = None):
    return controller.delete_notification(notification_id, service)
