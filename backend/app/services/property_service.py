"""Project & plot inventory services (two services in one module: same domain)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import AuditAction, Permission, PlotStatus
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, ConflictError
from app.core.responses import Paginated
from app.models.property import Document, Plot, Project
from app.repositories.finance_repository import AgentRepository
from app.repositories.property_repository import DocumentRepository, PlotRepository, ProjectRepository
from app.schemas.property import (
    DocumentCreate,
    DocumentResponse,
    DocumentUpdate,
    PlotBulkCreate,
    PlotCreate,
    PlotResponse,
    PlotStatusUpdate,
    PlotUpdate,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.base_service import BaseService
from app.services.plan_calculator import plot_premium, plot_total_price


class ProjectService(BaseService[Project]):
    resource = "project"
    repository_class = ProjectRepository
    permissions = {
        "view": Permission.PROJECT_VIEW,
        "create": Permission.PROJECT_WRITE,
        "update": Permission.PROJECT_WRITE,
        "delete": Permission.PROJECT_WRITE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.projects: ProjectRepository = self.repository  # type: ignore[assignment]
        self.plots = PlotRepository(db)

    def paginate(self, page: PaginationContext) -> Paginated[Project]:
        return self.list(page)

    def serialise(self, project: Project, counts: dict[str, int] | None = None) -> ProjectResponse:
        return ProjectResponse(
            id=project.id,
            public_id=project.public_id,
            name=project.name,
            phase=project.phase,
            city=project.city,
            location=project.location,
            rera_number=project.rera_number,
            total_plots=project.total_plots,
            base_rate_per_sqft=project.base_rate_per_sqft,
            estimated_revenue=project.estimated_revenue,
            is_active=project.is_active,
            premium_commercial=project.premium_commercial,
            premium_corner=project.premium_corner,
            premium_ne_facing=project.premium_ne_facing,
            premium_east_facing=project.premium_east_facing,
            premium_park_facing=project.premium_park_facing,
            plot_counts=counts or {},
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    def create_project(self, payload: ProjectCreate) -> Project:
        self._authorise("create")
        if self.projects.exists(name=payload.name):
            raise ConflictError(f"Project '{payload.name}' already exists")
        self.projects.release_deleted(self.actor.tenant_id, payload.name)
        project = Project(**payload.model_dump())
        self.projects.create(project)
        self._audit(AuditAction.CREATE, project, summary=f"Project {project.name} created")
        return project

    def update_project(self, project_id: int, payload: ProjectUpdate) -> Project:
        self._authorise("update")
        project = self.projects.get_or_404(project_id)
        self.projects.update(project, payload.model_dump(exclude_unset=True, exclude_none=True))
        self._audit(AuditAction.UPDATE, project, summary="Project updated")
        return project

    def delete_project(self, project_id: int) -> Project:
        self._authorise("delete")
        project = self.projects.get_or_404(project_id)
        in_use = self.db.execute(select(func.count(Plot.id)).where(
            Plot.project_id == project.id, Plot.is_deleted.is_(False),
            Plot.status != PlotStatus.AVAILABLE.value)).scalar_one()
        if in_use:
            raise BusinessRuleError(f"{in_use} plot(s) in this project are on hold, booked or sold — it cannot be deleted")
        for plot in self.db.execute(select(Plot).where(Plot.project_id == project.id, Plot.is_deleted.is_(False))).scalars():
            plot.soft_delete(self.actor.name)
        self.projects.delete(project, actor=self.actor.name)
        self._audit(AuditAction.DELETE, project, before=self._snapshot(project), summary="Project deleted")
        return project

    def portfolio(self) -> list[dict]:
        """Project list + per-status plot counts in two queries total."""
        return [
            {"project": self.serialise(project, counts), "counts": counts}
            for project, counts in self.projects.with_plot_counts()
        ]


class PlotService(BaseService[Plot]):
    resource = "plot"
    repository_class = PlotRepository
    permissions = {
        "view": Permission.PLOT_VIEW,
        "create": Permission.PLOT_WRITE,
        "update": Permission.PLOT_WRITE,
        "delete": Permission.PLOT_WRITE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.plots: PlotRepository = self.repository  # type: ignore[assignment]
        self.agents = AgentRepository(db)

    def paginate(self, page: PaginationContext) -> Paginated[Plot]:
        return self.list(page)

    def delete_plot(self, plot_id: int) -> Plot:
        self._authorise("delete")
        plot = self.plots.get_or_404(plot_id)
        if plot.status != PlotStatus.AVAILABLE.value:
            raise BusinessRuleError("Only an available plot can be deleted — it is currently " + plot.status.lower())
        self.plots.delete(plot, actor=self.actor.name)
        self._audit(AuditAction.DELETE, plot, before=self._snapshot(plot), summary="Plot deleted")
        return plot

    def serialise(self, plot: Plot) -> PlotResponse:

        plot_number = plot.plot_number
        # Inventory is visible to everyone; who holds a plot only to people entitled to know.
        full = self.actor.can(Permission.CUSTOMER_VIEW_ALL)
        mine = plot.agent_id is not None and plot.agent_id == self.actor.agent_id
        customer_id = plot.customer_id if (full or (mine and not self.actor.is_customer_portal)
                                           or (self.actor.is_customer_portal
                                               and plot.customer_id == self.actor.customer_id)) else None
        agent_id = plot.agent_id if (full or mine) else None
        return PlotResponse(
            id=plot.id,
            public_id=plot.public_id,
            plot_number=plot_number,
            project_id=plot.project_id,
            project_name=plot.project.name if plot.project else None,
            layout=plot.layout,
            area_sqft=plot.area_sqft,
            facing=plot.facing,
            price=plot.price,
            status=plot.status,
            customer_id=customer_id,
            agent_id=agent_id,
            hold_expires_at=plot.hold_expires_at,
            is_corner=plot.is_corner,
            is_commercial=plot.is_commercial,
            is_park_facing=plot.is_park_facing,
            premium=plot_premium(plot.project, plot) if plot.project else Decimal("0"),
            total_price=plot_total_price(plot.project, plot) if plot.project else plot.price,
            created_at=plot.created_at,
            updated_at=plot.updated_at,
        )

    def create_plot(self, payload: PlotCreate) -> Plot:
        self._authorise("create")
        if self.plots.find_by_number(payload.plot_number, payload.project_id):
            raise ConflictError(f"Plot {payload.plot_number} already exists in this project")
        self.plots.release_deleted(payload.project_id, [payload.plot_number])
        values = payload.model_dump(exclude={"agent_code"})
        values["status"] = (
            payload.status.value if isinstance(payload.status, PlotStatus) else str(payload.status)
        )
        if payload.agent_code:
            agent = self.agents.get_by_code(payload.agent_code)
            if agent is None:
                raise BusinessRuleError(f"Unknown agent code {payload.agent_code}")
            values["agent_id"] = agent.id
        plot = Plot(**values)
        self.plots.create(plot)
        self._audit(AuditAction.CREATE, plot, summary=f"Plot {plot.plot_number} added")
        return plot

    def create_plots_bulk(self, payload: PlotBulkCreate) -> list[Plot]:
        """Add a numbered run of identical plots to a project in one go (all or nothing)."""
        self._authorise("create")
        project = ProjectRepository(self.db).get_or_404(payload.project_id)
        numbers = [f"{payload.prefix}{payload.start + i}" for i in range(payload.count)]
        if any(len(n) > 24 for n in numbers):
            raise BusinessRuleError("Plot numbers would be longer than 24 characters — use a shorter prefix")
        clashes = [n for n in numbers if self.plots.find_by_number(n, payload.project_id)]
        if clashes:
            shown = ", ".join(clashes[:5]) + (" …" if len(clashes) > 5 else "")
            raise ConflictError(f"{len(clashes)} of these plot numbers already exist in {project.name}: {shown}")
        self.plots.release_deleted(payload.project_id, numbers)
        created: list[Plot] = []
        for number in numbers:
            plot = Plot(
                plot_number=number, project_id=payload.project_id, layout=payload.layout, facing=payload.facing,
                area_sqft=payload.area_sqft, price=payload.price, status=payload.status.value,
            )
            self.plots.create(plot)
            created.append(plot)
        total = self.db.execute(select(func.count(Plot.id)).where(
            Plot.project_id == project.id, Plot.is_deleted.is_(False))).scalar_one()
        if (project.total_plots or 0) < total:
            project.total_plots = int(total)        # the project cannot hold fewer plots than it now has
        self.audit.log(
            action=AuditAction.CREATE, resource="plot", resource_id=project.public_id,
            summary=f"{len(created)} plots added to {project.name} ({numbers[0]} to {numbers[-1]})", actor=self.actor,
        )
        return created

    def update_plot(self, plot_id: int, payload: PlotUpdate) -> Plot:
        self._authorise("update")
        plot = self.plots.get_or_404(plot_id)
        values = payload.model_dump(exclude_unset=True, exclude_none=True)
        if "status" in values and values["status"] is not None:
            values["status"] = (
                values["status"].value if isinstance(values["status"], PlotStatus) else str(values["status"])
            )
        before = {"status": plot.status, "price": str(plot.price)}
        self.plots.update(plot, values)
        self._audit(AuditAction.UPDATE, plot, before=before,
                    after={"status": plot.status, "price": str(plot.price)}, summary="Plot updated")
        return plot

    def set_status(self, plot_id: int, payload: PlotStatusUpdate) -> Plot:
        """Manual status override (admin correction) — full audit entry."""
        self._authorise("update")
        plot = self.plots.get_or_404(plot_id)
        before = plot.status
        if payload.status == PlotStatus.AVAILABLE.value:
            self.plots.release(plot)
        else:
            plot.status = payload.status
            self.db.flush()
        self._audit(AuditAction.UPDATE, plot, before={"status": before},
                    after={"status": plot.status},
                    summary=f"Status override: {payload.reason or 'no reason given'}")
        return plot

    def inventory(self) -> dict:
        summary = self.plots.status_summary()
        by_project = [
            {"project": project.name, "counts": counts}
            for project, counts in ProjectRepository(self.db).with_plot_counts()
        ]
        values = self.plots.inventory_value()
        return {
            "summary": summary,
            "total_value": float(sum(Decimal(str(v)) for v in values.values())),
            "by_project": by_project,
        }


class DocumentService(BaseService[Document]):
    resource = "document"
    repository_class = DocumentRepository
    permissions = {
        "view": Permission.DOCUMENT_VIEW,
        "create": Permission.DOCUMENT_UPLOAD,
        "update": Permission.DOCUMENT_UPLOAD,
        "delete": Permission.DOCUMENT_UPLOAD,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.documents: DocumentRepository = self.repository  # type: ignore[assignment]

    def scope_clause(self):
        """Staff with full customer access see all; an agent only their customers' files;
        a portal customer only files explicitly shared with them."""
        from sqlalchemy import and_, false, select

        from app.models.customer import Customer

        if self.actor.can(Permission.CUSTOMER_VIEW_ALL):
            return None
        if self.actor.is_customer_portal:
            if not self.actor.customer_id:
                return false()
            return and_(Document.customer_id == self.actor.customer_id,
                        Document.is_shared_with_customer.is_(True))
        if self.actor.agent_id:
            return Document.customer_id.in_(
                select(Customer.id).where(Customer.agent_id == self.actor.agent_id)
            )
        return false()

    def paginate(self, page: PaginationContext) -> Paginated[Document]:
        return self.list(page, scope_clause=self.scope_clause())

    def serialise(self, document: Document) -> DocumentResponse:
        return DocumentResponse(
            id=document.id,
            public_id=document.public_id,
            title=document.title,
            kind=document.kind,
            customer_id=document.customer_id,
            booking_id=document.booking_id,
            content_type=document.content_type,
            size_bytes=document.size_bytes,
            is_shared_with_customer=document.is_shared_with_customer,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )

    def register(self, payload: DocumentCreate) -> Document:
        """Register an upload that was already virus-scanned and stored in S3."""
        self._authorise("create")
        document = Document(**payload.model_dump())
        document.uploaded_by_id = self.actor.user_id
        self.documents.create(document)
        self._audit(AuditAction.CREATE, document, summary=f"Document '{document.title}' registered")
        return document

    def share(self, document_id: int, payload: DocumentUpdate | None = None) -> Document:
        self._authorise("update")
        document = self.get(document_id, scope_clause=self.scope_clause())
        self.documents.mark_shared(document)
        self._audit(AuditAction.UPDATE, document, summary="Document shared with customer")
        return document

    def for_customer(self, customer_id: int) -> list[DocumentResponse]:
        self._authorise("view")
        # Portal users only ever see documents explicitly shared with them.
        shared_only = self.actor.is_customer_portal
        visible = {
            d.id for d in self.documents.paginate(
                page=1, page_size=200, filters={"customer_id": customer_id}, scope_clause=self.scope_clause(),
            ).items
        }
        return [self.serialise(d) for d in self.documents.for_customer(customer_id, shared_only=shared_only)
                if d.id in visible]
