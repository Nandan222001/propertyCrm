"""Agent roster endpoints, including the admin dashboard agent lookup."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.core.constants import AuditAction, Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.core.responses import success
from app.repositories.booking_repository import BookingRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.finance_repository import AgentRepository, CommissionRepository, PaymentRepository
from app.repositories.property_repository import PlotRepository
from app.schemas.finance import AgentCreate, AgentPerformance, AgentUpdate
from app.services.base_service import BaseService


class AgentService(BaseService):
    resource = "agent"
    repository_class = AgentRepository
    permissions = {
        "view": Permission.PROJECT_VIEW,
        "create": Permission.USER_MANAGE,
        "update": Permission.USER_MANAGE,
        "delete": Permission.USER_MANAGE,
    }

    def __init__(self, db: DbDep, actor: ActorDep) -> None:
        super().__init__(db, actor)
        self.agents: AgentRepository = self.repository  # type: ignore[assignment]
        self.bookings = BookingRepository(db)
        self.payments = PaymentRepository(db)
        self.commissions = CommissionRepository(db)
        self.customers = CustomerRepository(db)
        self.plots = PlotRepository(db)

    def serialise(self, agent) -> dict:
        return {
            "id": agent.id,
            "public_id": agent.public_id,
            "code": agent.code,
            "name": agent.name,
            "email": agent.email,
            "phone": agent.phone,
            "commission_rate": str(agent.commission_rate),
            "is_active": agent.is_active,
            "created_at": agent.created_at,
        }

    def performance(self, agent_id: int) -> AgentPerformance:
        """Admin lookup: deals, sales, collection, commission for one agent."""
        agent = self.agents.get_or_404(agent_id)
        scope = self.bookings.scope_clause_for(agent_id=agent.id, customer_id=None)
        totals = self.bookings.totals(scope)
        commission = self.commissions.totals(CommissionRepository(self.db).model.agent_id == agent.id)
        deals = int(totals["deals"])
        return AgentPerformance(
            agent_id=agent.id,
            code=agent.code,
            name=agent.name,
            deals=deals,
            sales_value=totals["contract_value"],
            collected=totals["collected"],
            outstanding=totals["outstanding"],
            commission_net=commission["net"],
            conversion_rate=round(
                (deals / max(self.customers.count({"agent_id": agent.id}), 1)) * 100, 2
            ),
        )

    def create_agent(self, payload: AgentCreate) -> dict:
        self._authorise("create")
        from app.core.exceptions import ConflictError

        if self.agents.get_by_code(payload.code):
            raise ConflictError(f"Agent code {payload.code.upper()} already exists")
        agent = self.agents.create(
            self.agents.model(**{**payload.model_dump(), "code": payload.code.upper()})
        )
        self._audit(AuditAction.CREATE, agent, summary=f"Agent {agent.code} onboarded")
        self.db.commit()  # the UI reloads the list right away; don't wait for the request-end commit
        return self.serialise(agent)

    def update_agent(self, agent_id: int, payload: AgentUpdate) -> dict:
        self._authorise("update")
        agent = self.agents.get_or_404(agent_id)
        values = payload.model_dump(exclude_unset=True, exclude_none=True)
        if "code" in values:
            from app.core.exceptions import ConflictError

            values["code"] = values["code"].upper()
            clash = self.agents.get_by_code(values["code"])
            if clash is not None and clash.id != agent.id:
                raise ConflictError(f"Agent code {values['code']} already exists")
        self.agents.update(agent, values)
        self._audit(AuditAction.UPDATE, agent, summary="Agent updated")
        self.db.commit()
        return self.serialise(agent)


def get_agent_service(db: DbDep, actor: ActorDep) -> AgentService:
    return AgentService(db, actor)


AgentServiceDep = Annotated[AgentService, Depends(get_agent_service)]


def list_agents(page: PaginationDep, service: AgentServiceDep) -> dict:
    result = service.list(page)
    return success([service.serialise(a) for a in result.items], meta=result.meta.model_dump())


def leaderboard(service: AgentServiceDep) -> dict:
    service._authorise("view")
    return success(service.agents.leaderboard(limit=50), "Agent leaderboard")


def agent_performance(
    service: AgentServiceDep,
    agent_id: int = Query(gt=0),
) -> dict:
    return success(service.performance(agent_id).model_dump(), "Agent performance")


def create_agent(payload: AgentCreate, service: AgentServiceDep) -> dict:
    return success(service.create_agent(payload), "Agent onboarded")


def update_agent(agent_id: int, payload: AgentUpdate, service: AgentServiceDep) -> dict:
    return success(service.update_agent(agent_id, payload), "Agent updated")


def lookup_agent(
    service: AgentServiceDep,
    q: str = Query(min_length=2, max_length=40, description="Agent name or code"),
    _: Annotated[None, Depends(require(Permission.COMMISSION_VIEW))] = None,
) -> dict:
    """Type-ahead used by the admin dashboard (returns at most 10 matches)."""
    from sqlalchemy import or_

    from app.models.payment import Agent

    matches = service.db.execute(
        service.agents._base_query()
        .where(or_(Agent.name.like(f"%{q}%"), Agent.code.like(f"%{q.upper()}%")))
        .limit(10)
    ).scalars().all()
    return success([service.serialise(agent) for agent in matches], "Agent matches")
