"""Project / plot / document repositories (inventory domain)."""

from __future__ import annotations

from sqlalchemy import func, select

from app.core.constants import PlotStatus
from app.models.property import Document, Plot, Project
from app.repositories.base_repository import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project
    searchable = ("name", "city", "location", "phase", "rera_number")
    sortable = {
        "id": Project.id,
        "name": Project.name,
        "city": Project.city,
        "created_at": Project.created_at,
        "estimated_revenue": Project.estimated_revenue,
    }
    default_sort = "name"

    def with_plot_counts(self) -> list[tuple[Project, dict[str, int]]]:
        """Single grouped query — avoids the classic N+1 loop over projects."""
        stmt = (
            select(Plot.project_id, Plot.status, func.count(Plot.id))
            .where(Plot.is_deleted == 0)
            .group_by(Plot.project_id, Plot.status)
        )
        counts: dict[int, dict[str, int]] = {}
        for project_id, status, total in self.db.execute(stmt).all():
            counts.setdefault(project_id, {})[str(status)] = int(total)
        return [(project, counts.get(project.id, {})) for project in self.list(sort="name:asc")]


class PlotRepository(BaseRepository[Plot]):
    model = Plot
    searchable = ("plot_number", "layout", "facing")
    sortable = {
        "id": Plot.id,
        "plot_number": Plot.plot_number,
        "price": Plot.price,
        "area_sqft": Plot.area_sqft,
        "status": Plot.status,
    }
    default_sort = "plot_number"

    def available_in_project(self, project_id: int) -> list[Plot]:
        return self.list(filters={"project_id": project_id, "status": PlotStatus.AVAILABLE.value}, sort="plot_number:asc")

    def status_summary(self, project_id: int | None = None) -> dict[str, int]:
        stmt = select(Plot.status, func.count(Plot.id)).where(Plot.is_deleted == 0)
        if project_id is not None:
            stmt = stmt.where(Plot.project_id == project_id)
        rows = self.db.execute(stmt.group_by(Plot.status)).all()
        summary = {status.value: 0 for status in PlotStatus}
        summary.update({str(status): int(total) for status, total in rows})
        return summary

    def inventory_value(self) -> dict[str, float]:
        """Booked vs unsold value for the management dashboard."""
        stmt = (
            select(Plot.status, func.coalesce(func.sum(Plot.price), 0))
            .where(Plot.is_deleted == 0)
            .group_by(Plot.status)
        )
        return {str(status): float(total) for status, total in self.db.execute(stmt).all()}

    def find_by_number(self, plot_number: str, project_id: int | None = None) -> Plot | None:
        criteria = {"plot_number": plot_number}
        if project_id is not None:
            criteria["project_id"] = project_id
        return self.get_by(**criteria)

    def reserve(self, plot: Plot, *, customer_id: int, agent_id: int | None, status: PlotStatus) -> Plot:
        plot.status = status.value
        plot.customer_id = customer_id
        plot.agent_id = agent_id
        self.db.flush()
        return plot

    def release(self, plot: Plot) -> Plot:
        plot.status = PlotStatus.AVAILABLE.value
        plot.customer_id = None
        plot.hold_expires_at = None
        self.db.flush()
        return plot


class DocumentRepository(BaseRepository[Document]):
    model = Document
    searchable = ("title", "kind", "content_type")
    sortable = {"id": Document.id, "title": Document.title, "created_at": Document.created_at}
    default_sort = "created_at"

    def for_customer(self, customer_id: int, *, shared_only: bool = False) -> list[Document]:
        filters: dict = {"customer_id": customer_id}
        if shared_only:
            filters["is_shared_with_customer"] = True
        return self.list(filters=filters, sort="created_at:desc")

    def mark_shared(self, document: Document) -> Document:

        document.is_shared_with_customer = True
        document.expires_at = None
        self.db.flush()
        return document
