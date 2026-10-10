"""Booking workflow routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import booking_controller as controller
from app.core.constants import Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.schemas.booking import (
    BookingCreate,
    BookingDecision,
    BookingStatusUpdate,
    BookingUpdate,
    RegistryStageUpdate,
)

router = APIRouter(prefix="/bookings", tags=["Bookings"])

VIEW = Annotated[None, Depends(require(Permission.BOOKING_VIEW_ALL, Permission.BOOKING_VIEW_OWN))]
CREATE = Annotated[None, Depends(require(Permission.BOOKING_CREATE))]
UPDATE = Annotated[None, Depends(require(Permission.BOOKING_UPDATE))]
APPROVE = Annotated[None, Depends(require(Permission.BOOKING_APPROVE))]
DELETE = Annotated[None, Depends(require(Permission.BOOKING_DELETE))]


@router.get("", summary="List bookings (row-level scoped)")
def list_bookings(page: PaginationDep, service: controller.BookingServiceDep, _: VIEW = None):
    return controller.list_bookings(page, service)


@router.get("/summary", summary="Booking KPIs for the caller's scope")
def summary(service: controller.BookingServiceDep, _: VIEW = None):
    return controller.summary(service)


@router.get("/approvals", summary="Approval queue (bookings + customers)")
def approval_queue(db: DbDep, actor: ActorDep, _: APPROVE = None):
    return controller.approval_queue(db, actor, None)


@router.get("/{booking_id}", summary="Booking detail with timeline and receipts")
def get_booking(booking_id: int, service: controller.BookingServiceDep, _: VIEW = None):
    return controller.get_booking(booking_id, service)


@router.post("", status_code=status.HTTP_201_CREATED,
             summary="Create a booking (agents → pending approval, plot on hold)")
def create_booking(payload: BookingCreate, service: controller.BookingServiceDep, _: CREATE = None):
    return controller.create_booking(payload, service)


@router.patch("/{booking_id}", summary="Update a booking")
def update_booking(booking_id: int, payload: BookingUpdate, service: controller.BookingServiceDep,
                   _: UPDATE = None):
    return controller.update_booking(booking_id, payload, service)


@router.post("/{booking_id}/approve", summary="Approve a pending booking")
def approve_booking(booking_id: int, payload: BookingDecision, service: controller.BookingServiceDep,
                    _: APPROVE = None):
    return controller.approve_booking(booking_id, payload, service)


@router.post("/{booking_id}/reject", summary="Reject a booking and release the plot")
def reject_booking(booking_id: int, payload: BookingDecision, service: controller.BookingServiceDep,
                   _: APPROVE = None):
    return controller.reject_booking(booking_id, payload, service)


@router.post("/{booking_id}/status", summary="Lifecycle transition (agreement → registered → cancelled)")
def change_status(booking_id: int, payload: BookingStatusUpdate, service: controller.BookingServiceDep,
                  _: APPROVE = None):
    return controller.change_status(booking_id, payload, service)


@router.post("/{booking_id}/registry", summary="Registration progress (documents → agreement → sub-registrar → registered)")
def set_registry_stage(booking_id: int, payload: RegistryStageUpdate, service: controller.BookingServiceDep,
                       _: APPROVE = None):
    return controller.set_registry_stage(booking_id, payload, service)


@router.delete("/{booking_id}", summary="Soft-delete a booking")
def delete_booking(booking_id: int, service: controller.BookingServiceDep, _: DELETE = None):
    return controller.delete_booking(booking_id, service)
