"""Agent roster and performance routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.controllers import agent_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.finance import AgentCreate, AgentUpdate

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


@router.post("", status_code=status.HTTP_201_CREATED, summary="Onboard an agent")
def create_agent(payload: AgentCreate, service: controller.AgentServiceDep, _: MANAGE = None):
    return controller.create_agent(payload, service)


@router.patch("/{agent_id}", summary="Update an agent")
def update_agent(agent_id: int, payload: AgentUpdate, service: controller.AgentServiceDep,
                 _: MANAGE = None):
    return controller.update_agent(agent_id, payload, service)


@router.delete("/{agent_id}", summary="Delete an agent who has no bookings")
def delete_agent(agent_id: int, service: controller.AgentServiceDep, _: MANAGE = None):
    return controller.delete_agent(agent_id, service)
