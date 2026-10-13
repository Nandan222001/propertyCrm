"""Payment schemes (per project), quotes and booking payment schedules."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import plan_controller as controller
from app.core.constants import Permission
from app.core.dependencies import require
from app.schemas.payment_plan import PlanCreate, PlanUpdate, QuoteRequest

router = APIRouter(tags=["Payment schemes"])

PROJECT_VIEW = Annotated[None, Depends(require(Permission.PROJECT_VIEW))]
PROJECT_WRITE = Annotated[None, Depends(require(Permission.PROJECT_WRITE))]
BOOKING_VIEW = Annotated[None, Depends(require(Permission.BOOKING_VIEW_ALL, Permission.BOOKING_VIEW_OWN))]


@router.get("/projects/{project_id}/plans", summary="Payment schemes of a project")
def list_plans(project_id: int, service: controller.PlanServiceDep, _: PROJECT_VIEW = None):
    return controller.list_plans(project_id, service)


@router.post("/projects/{project_id}/plans", status_code=status.HTTP_201_CREATED, summary="Add a payment scheme")
def create_plan(project_id: int, payload: PlanCreate, service: controller.PlanServiceDep, _: PROJECT_WRITE = None):
    return controller.create_plan(project_id, payload, service)


@router.patch("/plans/{plan_id}", summary="Edit a payment scheme")
def update_plan(plan_id: int, payload: PlanUpdate, service: controller.PlanServiceDep, _: PROJECT_WRITE = None):
    return controller.update_plan(plan_id, payload, service)


@router.delete("/plans/{plan_id}", summary="Delete a payment scheme (existing bookings keep their own copy)")
def delete_plan(plan_id: int, service: controller.PlanServiceDep, _: PROJECT_WRITE = None):
    return controller.delete_plan(plan_id, service)


@router.post("/plans/quote", summary="Breakdown and schedule for a scheme on a plot or price")
def quote(payload: QuoteRequest, service: controller.PlanServiceDep, _: PROJECT_VIEW = None):
    return controller.quote(payload, service)


@router.get("/bookings/{booking_id}/installments", summary="Payment schedule of a booking")
def booking_installments(booking_id: int, db: controller.DbDep, actor: controller.ActorDep,
                         service: controller.PlanServiceDep, _: BOOKING_VIEW = None):
    return controller.booking_installments(booking_id, db, actor, service)
