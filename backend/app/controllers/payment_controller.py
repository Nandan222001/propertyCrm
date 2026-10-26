"""Collections endpoints: payments, ledger, receipts (print/share), overdue."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.constants import Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.core.responses import success
from app.schemas.finance import PaymentCreate
from app.services.payment_service import PaymentService


def get_payment_service(db: DbDep, actor: ActorDep) -> PaymentService:
    return PaymentService(db, actor)


PaymentServiceDep = Annotated[PaymentService, Depends(get_payment_service)]


def list_payments(page: PaginationDep, service: PaymentServiceDep) -> dict:
    result = service.paginate(page)
    return success([service.serialise(p).model_dump() for p in result.items], meta=result.meta.model_dump())


def record_payment(payload: PaymentCreate, service: PaymentServiceDep) -> dict:
    payment = service.record_payment(payload)
    receipt = payment.receipt.receipt_number if payment.receipt else "-"
    return success(
        service.serialise(payment).model_dump(),
        f"₹{payment.amount} recorded · bill {receipt} generated",
    )


def cancel_payment(payment_id: int, reason: str, service: PaymentServiceDep) -> dict:
    payment = service.cancel_payment(payment_id, reason)
    return success(service.serialise(payment).model_dump(), f"₹{payment.amount} payment cancelled")


def ledger(page: PaginationDep, service: PaymentServiceDep) -> dict:
    result = service.ledger(page)
    return success([row.model_dump() for row in result.items], meta=result.meta.model_dump())


def summary(service: PaymentServiceDep) -> dict:
    return success(service.summary().model_dump(), "Ledger summary")


def overdue(service: PaymentServiceDep) -> dict:
    return success([row.model_dump() for row in service.overdue()], "Overdue receivables")


def list_receipts(page: PaginationDep, service: PaymentServiceDep) -> dict:
    receipts = service.receipts_for()
    from app.schemas.finance import ReceiptResponse

    return success(
        [ReceiptResponse.model_validate(r, from_attributes=True).model_dump() for r in receipts],
        "Receipts",
    )


def get_receipt_copy(receipt_id: int, service: PaymentServiceDep) -> dict:
    """Printable A4 payload with office + customer copy and amount in words."""
    return success(service.receipt_copy(receipt_id).model_dump(), "Receipt copy")


def share_receipt(receipt_id: int, service: PaymentServiceDep) -> dict:
    receipt = service.share_receipt(receipt_id)
    return success(
        {"receipt_number": receipt.receipt_number, "shared": True},
        f"Bill {receipt.receipt_number} shared with the customer",
    )


def run_overdue_job(
    service: PaymentServiceDep,
    _: Annotated[None, Depends(require(Permission.PAYMENT_APPROVE))],
) -> dict:
    """Scheduler hook (also callable by finance admins) — marks overdue rows."""
    return success(service.mark_overdue(), "Overdue sweep completed")


def set_due_date(booking_number: str, payload: dict, service: PaymentServiceDep) -> dict:
    from datetime import date

    from app.core.exceptions import ValidationError

    try:
        due = date.fromisoformat(str(payload.get("due_date", "")))
    except ValueError as exc:
        raise ValidationError("due_date must be YYYY-MM-DD", code="invalid_date") from exc
    return success(service.set_next_due(booking_number, due), "Next due date updated")
