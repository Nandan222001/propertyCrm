"""Application routes — the application fee and enrollment fee, taken before a plot is allotted."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import application_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.application import ApplicationCreate, ApplicationUpdate
from app.schemas.finance import PaymentCancel

router = APIRouter(tags=["Applications"])

VIEW = Annotated[None, Depends(require(Permission.BOOKING_VIEW_ALL, Permission.BOOKING_VIEW_OWN))]
CREATE = Annotated[None, Depends(require(Permission.BOOKING_CREATE))]


@router.get("/applications", summary="List applications (application fee + enrollment received)")
def list_applications(page: PaginationDep, service: controller.ApplicationServiceDep, _: VIEW = None):
    return controller.list_applications(page, service)


@router.post("/applications", status_code=status.HTTP_201_CREATED, summary="Record an application and issue its receipt")
def create_application(payload: ApplicationCreate, service: controller.ApplicationServiceDep, _: CREATE = None):
    return controller.create_application(payload, service)


@router.patch("/applications/{application_id}", summary="Correct an application receipt entered with a mistake")
def update_application(application_id: int, payload: ApplicationUpdate, service: controller.ApplicationServiceDep,
                       _: Annotated[None, Depends(require(Permission.PAYMENT_APPROVE))] = None):
    return controller.update_application(application_id, payload, service)


@router.post("/applications/{application_id}/cancel", summary="Cancel an application (its fees stop counting)")
def cancel_application(application_id: int, payload: PaymentCancel, service: controller.ApplicationServiceDep,
                       _: Annotated[None, Depends(require(Permission.PAYMENT_APPROVE))] = None):
    return controller.cancel_application(application_id, payload.reason, service)
