"""Projects, plots and inventory endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.property import (
    DocumentCreate,
    DocumentUpdate,
    PlotBulkCreate,
    PlotCreate,
    PlotStatusUpdate,
    PlotUpdate,
    ProjectCreate,
    ProjectUpdate,
)
from app.services.property_service import DocumentService, PlotService, ProjectService


def get_project_service(db: DbDep, actor: ActorDep) -> ProjectService:
    return ProjectService(db, actor)


def get_plot_service(db: DbDep, actor: ActorDep) -> PlotService:
    return PlotService(db, actor)


def get_document_service(db: DbDep, actor: ActorDep) -> DocumentService:
    return DocumentService(db, actor)


ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
PlotServiceDep = Annotated[PlotService, Depends(get_plot_service)]
DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]


# ------------------------------------------------------------------ projects
def list_projects(page: PaginationDep, service: ProjectServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(p).model_dump() for p in result.items], meta=result.meta.model_dump())


def portfolio(service: ProjectServiceDep) -> dict:
    """Project list with per-status plot counts (single screen payload)."""
    return success(
        [
            {"project": entry["project"].model_dump(), "counts": entry["counts"]}
            for entry in service.portfolio()
        ],
        "Project portfolio",
    )


def create_project(payload: ProjectCreate, service: ProjectServiceDep) -> dict:
    project = service.create_project(payload)
    return success(service.serialise(project).model_dump(), "Project created")


def update_project(project_id: int, payload: ProjectUpdate, service: ProjectServiceDep) -> dict:
    project = service.update_project(project_id, payload)
    return success(service.serialise(project).model_dump(), "Project updated")


def delete_project(project_id: int, service: ProjectServiceDep) -> dict:
    service.delete_project(project_id)
    return success(None, "Project deleted")


# --------------------------------------------------------------------- plots
def list_plots(page: PaginationDep, service: PlotServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(p).model_dump() for p in result.items], meta=result.meta.model_dump())


def create_plot(payload: PlotCreate, service: PlotServiceDep) -> dict:
    plot = service.create_plot(payload)
    return success(service.serialise(plot).model_dump(), "Plot created")


def create_plots_bulk(payload: PlotBulkCreate, service: PlotServiceDep) -> dict:
    plots = service.create_plots_bulk(payload)
    return success([service.serialise(p).model_dump() for p in plots], f"{len(plots)} plots created")


def update_plot(plot_id: int, payload: PlotUpdate, service: PlotServiceDep) -> dict:
    plot = service.update_plot(plot_id, payload)
    return success(service.serialise(plot).model_dump(), "Plot updated")


def set_plot_status(plot_id: int, payload: PlotStatusUpdate, service: PlotServiceDep) -> dict:
    plot = service.set_status(plot_id, payload)
    return success(service.serialise(plot).model_dump(), f"Plot status set to {plot.status}")


def delete_plot(plot_id: int, service: PlotServiceDep) -> dict:
    service.delete_plot(plot_id)
    return success(None, "Plot deleted")


def inventory(service: PlotServiceDep) -> dict:
    return success(service.inventory(), "Inventory summary")


# ----------------------------------------------------------------- documents
def list_documents(page: PaginationDep, service: DocumentServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(d).model_dump() for d in result.items], meta=result.meta.model_dump())


def create_document(payload: DocumentCreate, service: DocumentServiceDep) -> dict:
    document = service.register(payload)
    return success(service.serialise(document).model_dump(), "Document registered")


def share_document(document_id: int, payload: DocumentUpdate, service: DocumentServiceDep) -> dict:
    document = service.share(document_id, payload)
    return success(service.serialise(document).model_dump(), "Document shared with customer")


def customer_documents(customer_id: int, service: DocumentServiceDep) -> dict:
    return success([d.model_dump() for d in service.for_customer(customer_id)], "Customer documents")
