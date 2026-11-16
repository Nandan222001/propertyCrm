"""Public plot map: which plots of an organisation are free and which are booked.

Exposes nothing but the plot number, its project and ``AVAILABLE`` / ``BOOKED`` — no prices, customers or agents.
Only an active organisation the super admin linked to a plot map is served; anything else is a plain 404 so the
endpoint cannot be used to discover which organisations exist.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import PLOT_MAPS, PlotStatus
from app.core.exceptions import NotFoundError
from app.core.responses import success
from app.db.tenancy import set_scope
from app.models.property import Plot, Project
from app.models.tenant import Tenant

_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$")


def plot_map(db: Session, slug: str) -> dict:
    tenant = db.execute(select(Tenant).where(Tenant.slug == slug.lower())).scalars().first() if _SLUG.match(slug.lower()) else None
    if tenant is None or not tenant.is_active or tenant.plot_map not in PLOT_MAPS:
        raise NotFoundError("Plot map not found")

    set_scope(db, tenant.id)  # everything below is filtered to this organisation
    rows = db.execute(
        select(Plot.plot_number, Plot.status, Project.name)
        .join(Project, Project.id == Plot.project_id)
        .where(Plot.is_deleted == 0)
    ).all()
    plots = [
        {"number": number, "status": "AVAILABLE" if status == PlotStatus.AVAILABLE.value else "BOOKED", "project": project}
        for number, status, project in rows
    ]
    return success({"name": tenant.name, "map": tenant.plot_map, "label": PLOT_MAPS[tenant.plot_map], "plots": plots},
                   "Plot map")
