"""Booking workflow endpoints (create, approve, reject, lifecycle, timeline)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.constants import Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.core.responses import success
from app.schemas.booking import (
    BookingCreate,
    BookingDecision,
    BookingStatusUpdate,
    BookingUpdate,
    RegistryStageUpdate,
)
from app.services.booking_service import BookingService
from app.services.customer_service import CustomerService


def get_booking_service(db: DbDep, actor: ActorDep) -> BookingService:
    return BookingService(db, actor)


BookingServiceDep = Annotated[BookingService, Depends(get_booking_service)]


def list_bookings(page: PaginationDep, service: BookingServiceDep) -> dict:
    """Agents see their own deals, customers their own bookings (row level)."""
    result = service.paginate(page)
    return success([service.serialise(b).model_dump() for b in result.items], meta=result.meta.model_dump())


def get_booking(booking_id: int, service: BookingServiceDep) -> dict:
    return success(service.detail(booking_id).model_dump())


def create_booking(payload: BookingCreate, service: BookingServiceDep) -> dict:
    booking = service.create_booking(payload)
    message = (
        f"Booking {booking.booking_number} confirmed"
        if booking.status == "CONFIRMED"
        else f"Booking {booking.booking_number} submitted for approval (plot on hold)"
    )
    return success(service.serialise(booking).model_dump(), message)


def update_booking(booking_id: int, payload: BookingUpdate, service: BookingServiceDep) -> dict:
    booking = service.update_booking(booking_id, payload)
    return success(service.serialise(booking).model_dump(), "Booking updated")


def approve_booking(booking_id: int, payload: BookingDecision, service: BookingServiceDep) -> dict:
    booking = service.approve(booking_id, payload)
    return success(service.serialise(booking).model_dump(), f"Booking {booking.booking_number} approved")


def reject_booking(booking_id: int, payload: BookingDecision, service: BookingServiceDep) -> dict:
    booking = service.reject(booking_id, payload)
    return success(service.serialise(booking).model_dump(), f"Booking {booking.booking_number} rejected")


def set_registry_stage(booking_id: int, payload: RegistryStageUpdate, service: BookingServiceDep) -> dict:
    booking = service.set_registry_stage(booking_id, payload.stage, payload.reason)
    return success(service.serialise(booking).model_dump(), f"Registry stage set to {payload.stage}")


def change_status(booking_id: int, payload: BookingStatusUpdate, service: BookingServiceDep) -> dict:
    booking = service.change_status(booking_id, payload)
    return success(service.serialise(booking).model_dump(), f"Status set to {booking.status}")


def delete_booking(booking_id: int, service: BookingServiceDep) -> dict:
    service.delete(booking_id)
    return success(None, "Booking deleted")


def summary(service: BookingServiceDep) -> dict:
    return success(service.summary(), "Booking summary")


def approval_queue(db: DbDep, actor: ActorDep,
                   _: Annotated[None, Depends(require(Permission.BOOKING_APPROVE))]) -> dict:
    """Everything an approver must action, in one payload."""
    bookings = BookingService(db, actor)
    customers = CustomerService(db, actor)
    pending_bookings = bookings.pending_queue()
    pending_customers = customers.pending()
    return success(
        {
            "bookings": [bookings.serialise(b).model_dump() for b in pending_bookings],
            "customers": [customers.serialise(c).model_dump() for c in pending_customers],
            "pending_total": len(pending_bookings) + len(pending_customers),
        },
        "Approval queue",
    )
