"""Commission endpoints: accrual, approval, payout."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.finance import CommissionCreate, CommissionDecision
from app.services.commission_service import CommissionService


def get_commission_service(db: DbDep, actor: ActorDep) -> CommissionService:
    return CommissionService(db, actor)


CommissionServiceDep = Annotated[CommissionService, Depends(get_commission_service)]


def list_commissions(page: PaginationDep, service: CommissionServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(c).model_dump() for c in result.items], meta=result.meta.model_dump())


def create_commission(payload: CommissionCreate, service: CommissionServiceDep) -> dict:
    commission = service.create_manual(payload)
    return success(service.serialise(commission).model_dump(), "Commission recorded")


def decide_commission(commission_id: int, payload: CommissionDecision, service: CommissionServiceDep) -> dict:
    commission = service.decide(commission_id, payload)
    return success(service.serialise(commission).model_dump(), f"Commission {commission.status.lower()}")


def commission_totals(service: CommissionServiceDep) -> dict:
    return success(service.totals(), "Commission totals")


def payable(service: CommissionServiceDep) -> dict:
    return success([c.model_dump() for c in service.payable()], "Commissions ready for payout")


def delete_commission(commission_id: int, service: CommissionServiceDep) -> dict:
    service.delete(commission_id)
    return success(None, "Commission deleted")
