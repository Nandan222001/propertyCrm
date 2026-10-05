"""Customer routes, including privacy endpoints (access / erasure / consent)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.controllers import customer_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, require
from app.schemas.customer import CustomerCreate, CustomerDecision, CustomerUpdate, DataSubjectRequestCreate

router = APIRouter(prefix="/customers", tags=["Customers"])

VIEW = Annotated[None, Depends(require(Permission.CUSTOMER_VIEW_ALL, Permission.CUSTOMER_VIEW_OWN))]
CREATE = Annotated[None, Depends(require(Permission.CUSTOMER_CREATE))]
UPDATE = Annotated[None, Depends(require(Permission.CUSTOMER_UPDATE))]
APPROVE = Annotated[None, Depends(require(Permission.CUSTOMER_APPROVE))]
DELETE = Annotated[None, Depends(require(Permission.CUSTOMER_DELETE))]
EXPORT = Annotated[None, Depends(require(Permission.DATA_EXPORT))]
ERASE = Annotated[None, Depends(require(Permission.DATA_ERASURE))]


@router.get("", summary="List customers (PII masked unless permitted)")
def list_customers(page: PaginationDep, service: controller.CustomerServiceDep, _: VIEW = None):
    return controller.list_customers(page, service)


@router.get("/pending", summary="Customers awaiting approval")
def pending(service: controller.CustomerServiceDep, _: APPROVE = None):
    return controller.pending_customers(service)


@router.get("/{customer_id}", summary="Customer detail")
def get_customer(customer_id: int, service: controller.CustomerServiceDep, _: VIEW = None):
    return controller.get_customer(customer_id, service)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a customer (pending approval)")
def create_customer(payload: CustomerCreate, service: controller.CustomerServiceDep, _: CREATE = None):
    return controller.create_customer(payload, service)


@router.patch("/{customer_id}", summary="Update a customer")
def update_customer(customer_id: int, payload: CustomerUpdate, service: controller.CustomerServiceDep,
                    _: UPDATE = None):
    return controller.update_customer(customer_id, payload, service)


@router.post("/{customer_id}/decision", summary="Approve or reject a customer entry")
def decide_customer(customer_id: int, payload: CustomerDecision, service: controller.CustomerServiceDep,
                    _: APPROVE = None):
    return controller.decide_customer(customer_id, payload, service)


@router.delete("/{customer_id}", summary="Soft-delete a customer")
def delete_customer(customer_id: int, service: controller.CustomerServiceDep, _: DELETE = None):
    return controller.delete_customer(customer_id, service)


# --------------------------------------------------------------- privacy
@router.get("/{customer_id}/consents", summary="Consent ledger for a customer")
def consent_history(customer_id: int, service: controller.CustomerServiceDep, _: VIEW = None):
    return controller.consent_history(customer_id, service)


@router.get("/{customer_id}/personal-data", summary="Right of access — export everything we hold")
def export_personal_data(customer_id: int, service: controller.CustomerServiceDep, _: EXPORT = None):
    return controller.export_personal_data(customer_id, service)


@router.delete("/{customer_id}/personal-data", summary="Right to erasure (irreversible)")
def erase_customer(
    customer_id: int,
    service: controller.CustomerServiceDep,
    reason: str = Query(min_length=5, max_length=255,
                        description="Documented lawful reason for the erasure request"),
    _: ERASE = None,
):
    return controller.erase_customer(customer_id, service, reason)


@router.post("/data-requests", status_code=status.HTTP_201_CREATED,
             summary="Log a data-subject request (30-day SLA)")
def create_data_request(payload: DataSubjectRequestCreate, service: controller.CustomerServiceDep,
                        _: VIEW = None):
    return controller.create_data_request(payload, service)
