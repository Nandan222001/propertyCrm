"""Application routes — the application fee and enrollment fee, taken before a plot is allotted."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import application_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.application import ApplicationCreate

router = APIRouter(tags=["Applications"])

VIEW = Annotated[None, Depends(require(Permission.BOOKING_VIEW_ALL, Permission.BOOKING_VIEW_OWN))]
CREATE = Annotated[None, Depends(require(Permission.BOOKING_CREATE))]


@router.get("/applications", summary="List applications (application fee + enrollment received)")
def list_applications(page: PaginationDep, service: controller.ApplicationServiceDep, _: VIEW = None):
    return controller.list_applications(page, service)


@router.post("/applications", status_code=status.HTTP_201_CREATED, summary="Record an application and issue its receipt")
def create_application(payload: ApplicationCreate, service: controller.ApplicationServiceDep, _: CREATE = None):
    return controller.create_application(payload, service)
