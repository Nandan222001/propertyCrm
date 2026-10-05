"""Customer endpoints: CRUD, approvals, consent and privacy operations."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.core.dependencies import ActorDep, DbDep, PaginationDep
from app.core.responses import success
from app.schemas.customer import (
    CustomerCreate,
    CustomerDecision,
    CustomerUpdate,
    DataSubjectRequestCreate,
)
from app.services.customer_service import CustomerService


def get_customer_service(db: DbDep, actor: ActorDep) -> CustomerService:
    return CustomerService(db, actor)


CustomerServiceDep = Annotated[CustomerService, Depends(get_customer_service)]


def list_customers(page: PaginationDep, service: CustomerServiceDep) -> dict:
    """PII is masked unless the caller holds ``pii:reveal``."""
    result = service.paginate(page)
    return success(
        [service.serialise(customer).model_dump() for customer in result.items],
        meta=result.meta.model_dump(),
    )


def get_customer(customer_id: int, service: CustomerServiceDep) -> dict:
    customer = service.get_customer(customer_id)
    return success(service.serialise(customer).model_dump())


def create_customer(payload: CustomerCreate, service: CustomerServiceDep) -> dict:
    customer = service.create_customer(payload)
    return success(service.serialise(customer).model_dump(), "Customer created (pending approval)")


def update_customer(customer_id: int, payload: CustomerUpdate, service: CustomerServiceDep) -> dict:
    customer = service.update_customer(customer_id, payload)
    return success(service.serialise(customer).model_dump(), "Customer updated")


def decide_customer(customer_id: int, payload: CustomerDecision, service: CustomerServiceDep) -> dict:
    customer = service.decide(customer_id, payload)
    return success(service.serialise(customer).model_dump(), f"Customer {customer.status.lower()}")


def delete_customer(customer_id: int, service: CustomerServiceDep) -> dict:
    service.delete(customer_id)
    return success(None, "Customer deleted")


def pending_customers(service: CustomerServiceDep) -> dict:
    return success([service.serialise(c).model_dump() for c in service.pending()], "Pending customers")


# --------------------------------------------------------------------- privacy
def consent_history(customer_id: int, service: CustomerServiceDep) -> dict:
    history = service.consent_history(customer_id)
    return success(
        [
            {
                "purpose": record.purpose,
                "granted": record.granted,
                "policy_version": record.policy_version,
                "captured_via": record.captured_via,
                "created_at": record.created_at.isoformat(),
            }
            for record in history
        ],
        "Consent ledger",
    )


def export_personal_data(customer_id: int, service: CustomerServiceDep) -> dict:
    """Right of access (DPDP/GDPR Art. 15) — audited export."""
    return success(service.export_personal_data(customer_id), "Personal data export")


def erase_customer(
    customer_id: int,
    service: CustomerServiceDep,
    reason: str = Query(min_length=5, max_length=255),
) -> dict:
    """Right to erasure — irreversible; keeps statutory financial records."""
    customer = service.erase(customer_id, reason=reason)
    return success(
        {"public_id": customer.public_id, "anonymised_at": str(customer.anonymised_at)},
        "Customer erased",
    )


def create_data_request(payload: DataSubjectRequestCreate, service: CustomerServiceDep) -> dict:
    request = service.create_data_request(payload)
    return success(
        {"id": request.id, "type": request.request_type, "due_by": str(request.due_by)},
        "Data subject request logged",
    )
