"""Application endpoints (step 1 of a booking)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.application import ApplicationCreate
from app.services.application_service import ApplicationService


def get_application_service(db: DbDep, actor: ActorDep) -> ApplicationService:
    return ApplicationService(db, actor)


ApplicationServiceDep = Annotated[ApplicationService, Depends(get_application_service)]


def list_applications(page: PaginationDep, service: ApplicationServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(a).model_dump(mode="json") for a in result.items], meta=result.meta.model_dump())


def create_application(payload: ApplicationCreate, service: ApplicationServiceDep) -> dict:
    application = service.record(payload)
    return success(service.serialise(application).model_dump(mode="json"),
                   f"₹{application.total} received · receipt {application.receipt_number} generated")
