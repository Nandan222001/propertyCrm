"""Billing routes: tax invoices with line items, GST, lifecycle and PDF bills."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.controllers import billing_controller as controller
from app.core.constants import Permission
from app.core.dependencies import PaginationDep, optional_filters, require
from app.schemas.billing import (
    INVOICE_STATUS_FILTERS,
    InvoiceCancel,
    InvoiceCreate,
    InvoiceIssue,
    InvoicePaymentCreate,
    InvoiceUpdate,
)

router = APIRouter(prefix="/invoices", tags=["Billing"])

VIEW = Annotated[None, Depends(require(Permission.INVOICE_VIEW_ALL, Permission.INVOICE_VIEW_OWN))]
CREATE = Annotated[None, Depends(require(Permission.INVOICE_CREATE))]
UPDATE = Annotated[None, Depends(require(Permission.INVOICE_UPDATE))]
ISSUE = Annotated[None, Depends(require(Permission.INVOICE_ISSUE))]
CANCEL = Annotated[None, Depends(require(Permission.INVOICE_CANCEL))]
PAY = Annotated[None, Depends(require(Permission.PAYMENT_CREATE))]
SHARE = Annotated[None, Depends(require(Permission.RECEIPT_MANAGE))]

InvoiceFilters = Annotated[dict, Depends(
    optional_filters(status="status", booking_id="booking_id", customer_id="customer_id")
)]


@router.get("", summary="List invoices (row-level scoped)")
def list_invoices(page: PaginationDep, filters: InvoiceFilters, service: controller.BillingServiceDep,
                  _: VIEW = None):
    whitelisted = {
        key: value for key, value in filters.items()
        if key != "status" or value in INVOICE_STATUS_FILTERS
    }
    for key in ("booking_id", "customer_id"):
        if key in whitelisted:
            whitelisted[key] = int(whitelisted[key])  # query params arrive as text
    page.filters = whitelisted
    return controller.list_invoices(page, service)


@router.get("/summary", summary="Billing KPIs: billed, collected, outstanding, overdue")
def summary(service: controller.BillingServiceDep, _: VIEW = None):
    return controller.billing_summary(service)


@router.post("/overdue-sweep", summary="Run the invoice overdue-marking job")
def run_overdue_sweep(service: controller.BillingServiceDep, _: ISSUE = None):
    return controller.run_overdue_sweep(service)


@router.post("", status_code=status.HTTP_201_CREATED,
             summary="Create a draft invoice with line items (totals computed server-side)")
def create_invoice(payload: InvoiceCreate, service: controller.BillingServiceDep, _: CREATE = None):
    return controller.create_invoice(payload, service)


@router.get("/{invoice_id}", summary="Invoice detail with items and status timeline")
def get_invoice(invoice_id: int, service: controller.BillingServiceDep, _: VIEW = None):
    return controller.get_invoice(invoice_id, service)


@router.patch("/{invoice_id}", summary="Edit a draft invoice (line items, dates, GST, discount)")
def update_invoice(invoice_id: int, payload: InvoiceUpdate, service: controller.BillingServiceDep,
                   _: UPDATE = None):
    return controller.update_invoice(invoice_id, payload, service)


@router.post("/{invoice_id}/issue", summary="Issue a draft — it becomes a collectible bill")
def issue_invoice(invoice_id: int, payload: InvoiceIssue, service: controller.BillingServiceDep,
                  _: ISSUE = None):
    return controller.issue_invoice(invoice_id, payload, service)


@router.post("/{invoice_id}/cancel", summary="Cancel an unpaid invoice with a reason")
def cancel_invoice(invoice_id: int, payload: InvoiceCancel, service: controller.BillingServiceDep,
                   _: CANCEL = None):
    return controller.cancel_invoice(invoice_id, payload, service)


@router.post("/{invoice_id}/payments", summary="Record a collection against this invoice")
def pay_invoice(invoice_id: int, payload: InvoicePaymentCreate, service: controller.BillingServiceDep,
                _: PAY = None):
    return controller.pay_invoice(invoice_id, payload, service)


@router.post("/{invoice_id}/share", summary="Share the bill with the customer (audited)")
def share_invoice(invoice_id: int, service: controller.BillingServiceDep, _: SHARE = None):
    return controller.share_invoice(invoice_id, service)


@router.get("/{invoice_id}/pdf", summary="Download the tax invoice as an A4 PDF")
def invoice_pdf(invoice_id: int, service: controller.BillingServiceDep, _: VIEW = None):
    return controller.invoice_pdf(invoice_id, service)
