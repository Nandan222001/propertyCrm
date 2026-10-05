"""Commission routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import commission_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.finance import CommissionCreate, CommissionDecision

router = APIRouter(prefix="/commissions", tags=["Commissions"])

VIEW = Annotated[None, Depends(require(Permission.COMMISSION_VIEW))]
APPROVE = Annotated[None, Depends(require(Permission.COMMISSION_APPROVE))]
PAYOUT = Annotated[None, Depends(require(Permission.COMMISSION_PAYOUT))]


@router.get("", summary="List commissions (agents see their own)")
def list_commissions(page: PaginationDep, service: controller.CommissionServiceDep, _: VIEW = None):
    return controller.list_commissions(page, service)


@router.get("/totals", summary="Commission totals (gross / TDS / net)")
def totals(service: controller.CommissionServiceDep, _: VIEW = None):
    return controller.commission_totals(service)


@router.get("/payable", summary="Commissions ready for payout")
def payable(service: controller.CommissionServiceDep, _: PAYOUT = None):
    return controller.payable(service)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Record a manual commission")
def create_commission(payload: CommissionCreate, service: controller.CommissionServiceDep,
                      _: APPROVE = None):
    return controller.create_commission(payload, service)


@router.post("/{commission_id}/decision", summary="Approve / hold / pay a commission")
def decide_commission(commission_id: int, payload: CommissionDecision,
                      service: controller.CommissionServiceDep, _: VIEW = None):
    return controller.decide_commission(commission_id, payload, service)


@router.delete("/{commission_id}", summary="Soft-delete a commission")
def delete_commission(commission_id: int, service: controller.CommissionServiceDep, _: APPROVE = None):
    return controller.delete_commission(commission_id, service)
