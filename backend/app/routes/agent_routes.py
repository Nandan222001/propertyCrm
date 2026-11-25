"""Agent roster and performance routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.controllers import agent_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.finance import AgentCreate, AgentUpdate, SubAgentCreate

router = APIRouter(prefix="/agents", tags=["Agents"])

VIEW = Annotated[None, Depends(require(Permission.PROJECT_VIEW))]
MANAGE = Annotated[None, Depends(require(Permission.USER_MANAGE))]
PERF = Annotated[None, Depends(require(Permission.COMMISSION_VIEW, Permission.BOOKING_VIEW_ALL))]


@router.get("", summary="List agents")
def list_agents(page: PaginationDep, service: controller.AgentServiceDep, _: VIEW = None):
    return controller.list_agents(page, service)


@router.get("/leaderboard", summary="Agent leaderboard (deals, sales, collections)")
def leaderboard(service: controller.AgentServiceDep, _: PERF = None):
    return controller.leaderboard(service)


@router.get("/performance", summary="Performance lookup for one agent")
def agent_performance(service: controller.AgentServiceDep, agent_id: int = Query(gt=0), _: PERF = None):
    return controller.agent_performance(service, agent_id)


@router.get("/lookup", summary="Type-ahead search by name or code")
def lookup_agent(service: controller.AgentServiceDep, q: str = Query(min_length=2, max_length=40),
                 _: PERF = None):
    return controller.lookup_agent(service, q, None)


TEAM = Annotated[None, Depends(require(Permission.COMMISSION_VIEW))]


@router.get("/team", summary="Your place in the agent hierarchy and everyone below you")
def my_team(service: controller.AgentServiceDep, _: TEAM = None):
    return controller.my_team(service)


@router.get("/sales", summary="Your direct sales (kind=direct) or your team's sales (kind=team)")
def my_sales(service: controller.AgentServiceDep, kind: str = Query("direct", pattern="^(direct|team)$"),
             _: TEAM = None):
    return controller.my_sales(kind, service)


@router.get("/payouts", summary="Payments the company has made to you")
def my_payouts(service: controller.AgentServiceDep, _: TEAM = None):
    return controller.my_payouts(service)


@router.get("/sales/payments", summary="Payments received on your direct and team sales")
def my_sale_payments(service: controller.AgentServiceDep, _: TEAM = None):
    return controller.my_sale_payments(service)


@router.post("/team", status_code=status.HTTP_201_CREATED,
             summary="Add an agent under you, handing them part of your commission rate")
def add_sub_agent(payload: SubAgentCreate, service: controller.AgentServiceDep, _: TEAM = None):
    return controller.add_sub_agent(payload, service)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Onboard an agent")
def create_agent(payload: AgentCreate, service: controller.AgentServiceDep, _: MANAGE = None):
    return controller.create_agent(payload, service)


@router.patch("/{agent_id}", summary="Update an agent")
def update_agent(agent_id: int, payload: AgentUpdate, service: controller.AgentServiceDep,
                 _: MANAGE = None):
    return controller.update_agent(agent_id, payload, service)


@router.post("/{agent_id}/login", summary="Create a sign-in for an existing agent (e-mail + starting password)")
def provision_agent_login(agent_id: int, service: controller.AgentServiceDep, _: MANAGE = None):
    return controller.provision_agent_login(agent_id, service)


@router.delete("/{agent_id}", summary="Delete an agent who has no bookings")
def delete_agent(agent_id: int, service: controller.AgentServiceDep, _: MANAGE = None):
    return controller.delete_agent(agent_id, service)
