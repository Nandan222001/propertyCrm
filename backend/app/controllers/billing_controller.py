"""Billing endpoints: invoices, lifecycle, settlement, PDF bills, KPIs."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Response

from app.core.constants import AuditAction, Permission
from app.core.dependencies import ActorDep, DbDep, PaginationDep, require
from app.core.responses import success
from app.schemas.billing import (
    InvoiceCancel,
    InvoiceCreate,
    InvoiceIssue,
    InvoicePaymentCreate,
    InvoiceUpdate,
)
from app.services.billing_service import BillingService
from app.services.invoice_pdf import render_invoice_pdf


def get_billing_service(db: DbDep, actor: ActorDep) -> BillingService:
    return BillingService(db, actor)


BillingServiceDep = Annotated[BillingService, Depends(get_billing_service)]


def list_invoices(page: PaginationDep, service: BillingServiceDep) -> dict:
    result = service.paginate(page)
    return success(
        [service.serialise(invoice).model_dump() for invoice in result.items],
        meta=result.meta.model_dump(),
    )


def billing_summary(service: BillingServiceDep) -> dict:
    return success(service.summary().model_dump(), "Billing summary")


def get_invoice(invoice_id: int, service: BillingServiceDep) -> dict:
    invoice = service.get_invoice(invoice_id)
    return success(service.serialise(invoice).model_dump(), "Invoice detail")


def create_invoice(payload: InvoiceCreate, service: BillingServiceDep) -> dict:
    invoice = service.create_invoice(payload)
    return success(
        service.serialise(invoice).model_dump(),
        f"Draft invoice {invoice.invoice_number} created for ₹{invoice.total_amount:,.0f}",
    )


def update_invoice(invoice_id: int, payload: InvoiceUpdate, service: BillingServiceDep) -> dict:
    invoice = service.update_invoice(invoice_id, payload)
    return success(service.serialise(invoice).model_dump(), f"Draft {invoice.invoice_number} updated")


def issue_invoice(invoice_id: int, payload: InvoiceIssue, service: BillingServiceDep) -> dict:
    invoice = service.issue_invoice(invoice_id, payload)
    return success(
        service.serialise(invoice).model_dump(),
        f"Invoice {invoice.invoice_number} issued · due {invoice.due_date:%d %b %Y}",
    )


def cancel_invoice(invoice_id: int, payload: InvoiceCancel, service: BillingServiceDep) -> dict:
    invoice = service.cancel_invoice(invoice_id, payload)
    return success(service.serialise(invoice).model_dump(),
                   f"Invoice {invoice.invoice_number} cancelled")


def pay_invoice(invoice_id: int, payload: InvoicePaymentCreate, service: BillingServiceDep) -> dict:
    """Collect against a bill — creates the ledger payment + numbered receipt."""
    invoice = service.record_payment(invoice_id, payload)
    receipt = ""
    for payment in service.payments_against(invoice):
        if payment.receipt and receipt == "":
            receipt = f" · receipt {payment.receipt.receipt_number}"
    return success(
        service.serialise(invoice).model_dump(),
        f"₹{payload.amount:,.0f} collected on {invoice.invoice_number}{receipt}",
    )


def share_invoice(invoice_id: int, service: BillingServiceDep) -> dict:
    invoice = service.share_invoice(invoice_id)
    return success(
        {"invoice_number": invoice.invoice_number, "shared": True},
        f"Bill {invoice.invoice_number} shared with the customer",
    )


def invoice_pdf(invoice_id: int, service: BillingServiceDep) -> Response:
    """Stream the tax invoice as a print-ready A4 PDF (download audited)."""
    invoice = service.get_invoice(invoice_id)
    payload = service.pdf_payload(invoice)
    pdf_bytes = render_invoice_pdf(payload)
    service.record_custom_audit(
        AuditAction.INVOICE_PDF,
        resource_id=invoice.invoice_number,
        summary=f"Invoice {invoice.invoice_number} PDF generated ({len(pdf_bytes)} bytes)",
    )
    filename = f"{invoice.invoice_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


def run_overdue_sweep(service: BillingServiceDep) -> dict:
    return success(service.mark_overdue(), "Invoice overdue sweep completed")
