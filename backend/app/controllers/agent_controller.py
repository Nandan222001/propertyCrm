"""Agent roster endpoints, including the admin dashboard agent lookup."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.core.constants import AuditAction, Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.core.exceptions import BusinessRuleError, PermissionDeniedError
from app.core.responses import success
from app.repositories.booking_repository import BookingRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.finance_repository import AgentRepository, CommissionRepository, PaymentRepository
from app.repositories.property_repository import PlotRepository
from app.schemas.finance import AgentCreate, AgentPerformance, AgentUpdate
from app.services.base_service import BaseService
from app.services.notification_service import agent_user_id


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

    # ------------------------------------------------------------ row scope
    @property
    def _sees_all_agents(self) -> bool:
        """Managers / accounts / admin / management see the whole team; an agent only themself."""
        return self.actor.can(Permission.BOOKING_VIEW_ALL)

    def _allowed_agent_ids(self) -> set[int]:
        if self._sees_all_agents:
            return set()  # unused
        return {self.actor.agent_id} if self.actor.agent_id else set()

    def scope_clause(self):
        from sqlalchemy import false

        if self._sees_all_agents:
            return None
        return self.agents.model.id == self.actor.agent_id if self.actor.agent_id else false()

    def visible_agent_rows(self, rows: list[dict]) -> list[dict]:
        if self._sees_all_agents:
            return rows
        allowed = self._allowed_agent_ids()
        return [r for r in rows if r["id"] in allowed]

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
            "has_login": agent_user_id(self.db, agent) is not None,
            "created_at": agent.created_at,
        }

    def performance(self, agent_id: int) -> AgentPerformance:
        """Deals, sales, collection, commission for one agent (an agent may only ask about themself)."""
        agent = self.agents.get_or_404(agent_id)
        if not self._sees_all_agents and agent.id not in self._allowed_agent_ids():
            raise PermissionDeniedError("You can only view your own performance")
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
        wants_login = bool(payload.email and payload.phone)
        if wants_login:
            self._check_login_can_be_created(payload.name, payload.email, payload.phone)
        agent = self.agents.create(
            self.agents.model(**{**payload.model_dump(), "code": payload.code.upper()})
        )
        self._audit(AuditAction.CREATE, agent, summary=f"Agent {agent.code} onboarded")
        login = ""
        if wants_login:
            self._create_login(agent)
            login = "login created: e-mail + starting password (first 4 letters of the name + last 5 digits of the mobile)"
        else:
            login = "no login created: add an e-mail and mobile number, then use Create login"
        self.db.commit()  # the UI reloads the list right away; don't wait for the request-end commit
        return {**self.serialise(agent), "login": login}

    # ------------------------------------------------------------ sign-in
    def _users(self):
        from app.services.user_service import UserService

        return UserService(self.db, self.actor)

    def _check_login_can_be_created(self, name: str, email: str, phone: str) -> None:
        """Fail *before* anything is saved if the agent could not be given a login."""
        from app.core.exceptions import ConflictError
        from app.core.passwords import initial_password
        from app.repositories.user_repository import UserRepository

        initial_password(name, phone)                       # needs 4 letters in the name and a mobile number
        if UserRepository(self.db).get_by_email(email.lower().strip()):
            raise ConflictError("An account with this e-mail already exists")
        self._users()._assert_seat_available()

    def _create_login(self, agent) -> None:
        from app.core.constants import Role
        from app.schemas.governance import UserCreate

        self._users().create_user(UserCreate(
            name=agent.name, email=agent.email, phone=agent.phone, role=Role.SALES_AGENT,
            title="Sales agent", agent_code=agent.code,
        ))

    def provision_login(self, agent_id: int) -> dict:
        """Give an existing agent a sign-in (their e-mail + the starting password)."""
        from app.core.exceptions import BusinessRuleError

        self._authorise("update")
        agent = self.agents.get_or_404(agent_id)
        if agent_user_id(self.db, agent) is not None:
            raise BusinessRuleError(f"{agent.name} already has a login")
        if not agent.email or not agent.phone:
            raise BusinessRuleError("Add the agent's e-mail and mobile number first (Edit agent), then create the login")
        self._check_login_can_be_created(agent.name, agent.email, agent.phone)
        self._create_login(agent)
        self._audit(AuditAction.UPDATE, agent, summary="Login created for agent")
        self.db.commit()
        return {**self.serialise(agent), "login": "login created"}

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
        if "email" in values and agent.user_id:
            # The agent signs in with their e-mail: keep the login in step when it changes.
            from app.repositories.user_repository import UserRepository

            repo = UserRepository(self.db)
            login = repo.get(agent.user_id)
            if login is not None and not repo.get_by_email(values["email"]):
                login.email = values["email"].lower().strip()
        self._audit(AuditAction.UPDATE, agent, summary="Agent updated")
        self.db.commit()
        return self.serialise(agent)


    def delete_agent(self, agent_id: int) -> None:
        """Remove an agent who has no deals; one with history is deactivated instead."""
        self._authorise("delete")
        agent = self.agents.get_or_404(agent_id)
        from sqlalchemy import func, select

        from app.models.booking import Booking

        deals = self.db.execute(select(func.count(Booking.id)).where(
            Booking.agent_id == agent.id, Booking.is_deleted.is_(False))).scalar_one()
        if deals:
            raise BusinessRuleError(f"{agent.name} has {deals} booking(s) — set the agent to inactive instead of deleting")
        self.agents.delete(agent, actor=self.actor.name)
        self._audit(AuditAction.DELETE, agent, summary="Agent deleted")
        self.db.commit()


def get_agent_service(db: DbDep, actor: ActorDep) -> AgentService:
    return AgentService(db, actor)


AgentServiceDep = Annotated[AgentService, Depends(get_agent_service)]


def list_agents(page: PaginationDep, service: AgentServiceDep) -> dict:
    result = service.list(page, scope_clause=service.scope_clause())
    return success([service.serialise(a) for a in result.items], meta=result.meta.model_dump())


def leaderboard(service: AgentServiceDep) -> dict:
    service._authorise("view")
    return success(service.visible_agent_rows(service.agents.leaderboard(limit=50)), "Agent leaderboard")


def agent_performance(
    service: AgentServiceDep,
    agent_id: int = Query(gt=0),
) -> dict:
    return success(service.performance(agent_id).model_dump(), "Agent performance")


def create_agent(payload: AgentCreate, service: AgentServiceDep) -> dict:
    return success(service.create_agent(payload), "Agent onboarded")


def provision_agent_login(agent_id: int, service: AgentServiceDep) -> dict:
    return success(service.provision_login(agent_id), "Agent login created")


def update_agent(agent_id: int, payload: AgentUpdate, service: AgentServiceDep) -> dict:
    return success(service.update_agent(agent_id, payload), "Agent updated")


def delete_agent(agent_id: int, service: AgentServiceDep) -> dict:
    service.delete_agent(agent_id)
    return success(None, "Agent deleted")


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
    if not service._sees_all_agents:
        allowed = service._allowed_agent_ids()
        matches = [a for a in matches if a.id in allowed]
    return success([service.serialise(agent) for agent in matches], "Agent matches")
