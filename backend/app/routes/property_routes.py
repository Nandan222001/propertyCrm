"""Project, plot, inventory and document routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import property_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.property import (
    DocumentCreate,
    DocumentUpdate,
    PlotCreate,
    PlotStatusUpdate,
    PlotUpdate,
    ProjectCreate,
    ProjectUpdate,
)

router = APIRouter(tags=["Inventory"])

PROJECT_VIEW = Annotated[None, Depends(require(Permission.PROJECT_VIEW))]
PROJECT_WRITE = Annotated[None, Depends(require(Permission.PROJECT_WRITE))]
PLOT_VIEW = Annotated[None, Depends(require(Permission.PLOT_VIEW))]
PLOT_WRITE = Annotated[None, Depends(require(Permission.PLOT_WRITE))]
DOC_VIEW = Annotated[None, Depends(require(Permission.DOCUMENT_VIEW))]
DOC_UPLOAD = Annotated[None, Depends(require(Permission.DOCUMENT_UPLOAD))]


# ---------------------------------------------------------------- projects
@router.get("/projects", summary="List projects")
def list_projects(page: PaginationDep, service: controller.ProjectServiceDep, _: PROJECT_VIEW = None):
    return controller.list_projects(page, service)


@router.get("/projects/portfolio", summary="Project portfolio with plot counts")
def portfolio(service: controller.ProjectServiceDep, _: PROJECT_VIEW = None):
    return controller.portfolio(service)


@router.post("/projects", status_code=status.HTTP_201_CREATED, summary="Create a project")
def create_project(payload: ProjectCreate, service: controller.ProjectServiceDep, _: PROJECT_WRITE = None):
    return controller.create_project(payload, service)


@router.patch("/projects/{project_id}", summary="Update a project")
def update_project(project_id: int, payload: ProjectUpdate, service: controller.ProjectServiceDep,
                   _: PROJECT_WRITE = None):
    return controller.update_project(project_id, payload, service)


@router.delete("/projects/{project_id}", summary="Soft-delete a project")
def delete_project(project_id: int, service: controller.ProjectServiceDep, _: PROJECT_WRITE = None):
    return controller.delete_project(project_id, service)


# ------------------------------------------------------------------- plots
@router.get("/plots", summary="List plots (search / sort / filter)")
def list_plots(page: PaginationDep, service: controller.PlotServiceDep, _: PLOT_VIEW = None):
    return controller.list_plots(page, service)


@router.get("/plots/inventory", summary="Inventory summary by status and project")
def inventory(service: controller.PlotServiceDep, _: PLOT_VIEW = None):
    return controller.inventory(service)


@router.post("/plots", status_code=status.HTTP_201_CREATED, summary="Create a plot")
def create_plot(payload: PlotCreate, service: controller.PlotServiceDep, _: PLOT_WRITE = None):
    return controller.create_plot(payload, service)


@router.patch("/plots/{plot_id}", summary="Update a plot")
def update_plot(plot_id: int, payload: PlotUpdate, service: controller.PlotServiceDep, _: PLOT_WRITE = None):
    return controller.update_plot(plot_id, payload, service)


@router.post("/plots/{plot_id}/status", summary="Override plot status (audited)")
def set_plot_status(plot_id: int, payload: PlotStatusUpdate, service: controller.PlotServiceDep,
                    _: PLOT_WRITE = None):
    return controller.set_plot_status(plot_id, payload, service)


@router.delete("/plots/{plot_id}", summary="Soft-delete a plot")
def delete_plot(plot_id: int, service: controller.PlotServiceDep, _: PLOT_WRITE = None):
    return controller.delete_plot(plot_id, service)


# --------------------------------------------------------------- documents
@router.get("/documents", summary="List documents")
def list_documents(page: PaginationDep, service: controller.DocumentServiceDep, _: DOC_VIEW = None):
    return controller.list_documents(page, service)


@router.post("/documents", status_code=status.HTTP_201_CREATED, summary="Register an uploaded document")
def create_document(payload: DocumentCreate, service: controller.DocumentServiceDep, _: DOC_UPLOAD = None):
    return controller.create_document(payload, service)


@router.post("/documents/{document_id}/share", summary="Share a document with the customer")
def share_document(document_id: int, payload: DocumentUpdate, service: controller.DocumentServiceDep,
                   _: DOC_UPLOAD = None):
    return controller.share_document(document_id, payload, service)


@router.get("/customers/{customer_id}/documents", summary="Documents for a customer")
def customer_documents(customer_id: int, service: controller.DocumentServiceDep, _: DOC_VIEW = None):
    return controller.customer_documents(customer_id, service)
