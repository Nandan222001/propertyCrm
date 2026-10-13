"""Payment scheme endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep
from app.core.responses import success
from app.schemas.payment_plan import PlanCreate, PlanUpdate, QuoteRequest
from app.services.booking_service import BookingService
from app.services.plan_service import PlanService


def get_plan_service(db: DbDep, actor: ActorDep) -> PlanService:
    return PlanService(db, actor)


PlanServiceDep = Annotated[PlanService, Depends(get_plan_service)]


def list_plans(project_id: int, service: PlanServiceDep) -> dict:
    return success([service.serialise(p).model_dump() for p in service.list_for_project(project_id)], "Payment schemes")


def create_plan(project_id: int, payload: PlanCreate, service: PlanServiceDep) -> dict:
    return success(service.serialise(service.create(project_id, payload)).model_dump(), "Payment scheme created")


def update_plan(plan_id: int, payload: PlanUpdate, service: PlanServiceDep) -> dict:
    return success(service.serialise(service.update(plan_id, payload)).model_dump(), "Payment scheme updated")


def delete_plan(plan_id: int, service: PlanServiceDep) -> dict:
    service.delete(plan_id)
    return success(None, "Payment scheme deleted")


def quote(payload: QuoteRequest, service: PlanServiceDep) -> dict:
    return success(service.quote(payload), "Quote")


def booking_installments(booking_id: int, db: DbDep, actor: ActorDep, service: PlanServiceDep) -> dict:
    bookings = BookingService(db, actor)
    bookings.get(booking_id, scope_clause=bookings.scope_clause())      # the same row-level access as the booking itself
    return success([service.serialise_installment(i).model_dump() for i in service.installments(booking_id)],
                   "Payment schedule")
