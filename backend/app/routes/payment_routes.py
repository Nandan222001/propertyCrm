"""Collections, ledger, receipt and overdue routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import payment_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.finance import PaymentCreate

router = APIRouter(tags=["Collections"])

VIEW_ALL = Annotated[None, Depends(require(Permission.PAYMENT_VIEW_ALL, Permission.PAYMENT_VIEW_OWN))]
CREATE = Annotated[None, Depends(require(Permission.PAYMENT_CREATE))]
APPROVE = Annotated[None, Depends(require(Permission.PAYMENT_APPROVE))]
RECEIPT = Annotated[None, Depends(require(Permission.RECEIPT_MANAGE))]


@router.get("/payments", summary="List payment entries")
def list_payments(page: PaginationDep, service: controller.PaymentServiceDep, _: VIEW_ALL = None):
    return controller.list_payments(page, service)


@router.post("/payments", status_code=status.HTTP_201_CREATED,
             summary="Record a collection and issue a numbered receipt")
def record_payment(payload: PaymentCreate, service: controller.PaymentServiceDep, _: CREATE = None):
    return controller.record_payment(payload, service)


@router.get("/ledger", summary="Ledger rows with live balance and due dates")
def ledger(page: PaginationDep, service: controller.PaymentServiceDep, _: VIEW_ALL = None):
    return controller.ledger(page, service)


@router.get("/ledger/summary", summary="Collections KPIs, ageing buckets and overdue total")
def summary(service: controller.PaymentServiceDep, _: VIEW_ALL = None):
    return controller.summary(service)


@router.get("/ledger/overdue", summary="Overdue receivables with days past due")
def overdue(service: controller.PaymentServiceDep, _: VIEW_ALL = None):
    return controller.overdue(service)


@router.post("/ledger/overdue-sweep", summary="Run the overdue-marking job")
def run_overdue_job(service: controller.PaymentServiceDep, _: APPROVE = None):
    return controller.run_overdue_job(service, None)


@router.get("/receipts", summary="Receipts visible to the caller")
def list_receipts(page: PaginationDep, service: controller.PaymentServiceDep, _: VIEW_ALL = None):
    return controller.list_receipts(page, service)


@router.get("/receipts/{receipt_id}/copy", summary="Printable receipt (office + customer copy)")
def get_receipt_copy(receipt_id: int, service: controller.PaymentServiceDep, _: VIEW_ALL = None):
    return controller.get_receipt_copy(receipt_id, service)


@router.post("/receipts/{receipt_id}/share", summary="Share a bill with the customer")
def share_receipt(receipt_id: int, service: controller.PaymentServiceDep, _: RECEIPT = None):
    return controller.share_receipt(receipt_id, service)
