"""Billing schemas: tax invoices, line items, lifecycle actions and KPIs."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.core.constants import INVOICE_GST_RATES, InvoiceStatus
from app.core.validators import normalise_enum, to_date, to_decimal
from app.schemas.common import Money, ORMModel, RequestModel, SafeText, TimestampedResponse
from app.schemas.finance import PAYMENT_MODES

#: Line items per invoice (bound so a request can never spray thousands of rows).
MAX_INVOICE_ITEMS = 50


class InvoiceItemIn(RequestModel):
    """One billed line as submitted by the client."""

    description: str = Field(min_length=2, max_length=255)
    hsn_sac: str | None = Field(default=None, max_length=16, pattern=r"^[A-Za-z0-9\-]*$")
    quantity: Decimal = Field(default=Decimal("1"), gt=0, le=Decimal("100000"))
    unit: str = Field(default="NOS", max_length=16)
    unit_price: Money
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)

    @field_validator("quantity", "unit_price", "discount_amount", mode="before")
    @classmethod
    def _decimals(cls, value):
        return to_decimal(value)

    @model_validator(mode="after")
    def _discount_within_line(self) -> InvoiceItemIn:
        base = (self.quantity * self.unit_price).quantize(Decimal("0.01"))
        if self.discount_amount > base:
            raise ValueError("line discount cannot exceed quantity * rate")
        return self


class InvoiceCreate(SafeText):
    booking_id: int = Field(gt=0, description="Bill is raised against a plot booking")
    issue_date: date | None = None
    due_date: date | None = None
    gst_rate: Decimal | None = None   # blank = the organisation's default GST rate
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = Field(default=None, max_length=2000)
    terms: str | None = Field(default=None, max_length=2000)
    items: list[InvoiceItemIn] = Field(min_length=1, max_length=MAX_INVOICE_ITEMS)

    @field_validator("gst_rate", mode="before")
    @classmethod
    def _rate(cls, value):
        if value is None or value == "":
            return None
        rate = to_decimal(value)
        if rate not in INVOICE_GST_RATES:
            allowed = ", ".join(str(r) for r in INVOICE_GST_RATES)
            raise ValueError(f"gst_rate must be one of: {allowed}")
        return rate

    @field_validator("issue_date", "due_date", mode="before")
    @classmethod
    def _dates(cls, value, info):
        return to_date(value, field=info.field_name.replace("_", " ")) if value else None

    @model_validator(mode="after")
    def _invoice_discount_within_subtotal(self) -> InvoiceCreate:
        subtotal = sum(
            ((item.quantity * item.unit_price) for item in self.items), Decimal("0")
        ).quantize(Decimal("0.01"))
        if self.discount_amount > subtotal:
            raise ValueError("invoice discount cannot exceed the subtotal")
        if self.due_date and self.issue_date and self.due_date < self.issue_date:
            raise ValueError("due date cannot precede the issue date")
        return self


class InvoiceUpdate(SafeText):
    """Draft-only edits: item list, dates, GST rate, discount and text fields."""

    issue_date: date | None = None
    due_date: date | None = None
    gst_rate: Decimal | None = None
    discount_amount: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    terms: str | None = None
    items: list[InvoiceItemIn] | None = Field(default=None, min_length=1, max_length=MAX_INVOICE_ITEMS)

    @field_validator("gst_rate", mode="before")
    @classmethod
    def _rate(cls, value):
        if value is None:
            return None
        rate = to_decimal(value)
        if rate not in INVOICE_GST_RATES:
            allowed = ", ".join(str(r) for r in INVOICE_GST_RATES)
            raise ValueError(f"gst_rate must be one of: {allowed}")
        return rate

    @field_validator("issue_date", "due_date", mode="before")
    @classmethod
    def _dates(cls, value, info):
        return to_date(value, field=info.field_name.replace("_", " ")) if value else None


class InvoiceIssue(SafeText):
    """Finalise a draft: it becomes a numbered, dated, collectible bill."""

    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("due_date", mode="before")
    @classmethod
    def _due(cls, value):
        return to_date(value, field="due date") if value else None


class InvoiceCancel(SafeText):
    reason: str = Field(min_length=3, max_length=255)


class InvoicePaymentCreate(SafeText):
    """Record a collection against an invoice (flows into the payments ledger)."""

    amount: Money
    mode: str = Field(default="UPI", max_length=24)
    reference: str | None = Field(default=None, max_length=80)
    received_on: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("amount", mode="before")
    @classmethod
    def _amount(cls, value):
        return to_decimal(value)

    @field_validator("mode")
    @classmethod
    def _mode(cls, value: str) -> str:
        return normalise_enum(value, PAYMENT_MODES, field="mode")

    @field_validator("received_on", mode="before")
    @classmethod
    def _received(cls, value):
        return to_date(value, field="received on") if value else None

    @model_validator(mode="after")
    def _amount_rules(self) -> InvoicePaymentCreate:
        if self.amount <= 0:
            raise ValueError("payment amount must be greater than zero")
        return self


class InvoiceItemResponse(ORMModel):
    id: int
    description: str
    hsn_sac: str | None = None
    quantity: Decimal
    unit: str = "NOS"
    unit_price: Decimal
    discount_amount: Decimal
    line_total: Decimal


class InvoiceHistoryEntry(ORMModel):
    id: int
    from_status: str | None = None
    to_status: str
    changed_by_label: str | None = None
    reason: str | None = None
    created_at: datetime


class InvoiceResponse(TimestampedResponse):
    public_id: str
    invoice_number: str
    booking_id: int
    booking_number: str | None = None
    customer_id: int
    customer_name: str | None = None
    agent_name: str | None = None
    project_name: str | None = None
    plot_number: str | None = None
    issue_date: date
    due_date: date | None = None
    status: str
    subtotal: Decimal
    discount_amount: Decimal
    taxable_value: Decimal
    gst_rate: Decimal
    gst_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    round_off: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    balance_amount: Decimal
    item_count: int = 0
    items: list[InvoiceItemResponse] = []
    history: list[InvoiceHistoryEntry] = []
    notes: str | None = None
    terms: str | None = None
    is_shared_with_customer: bool = False
    cancellation_reason: str | None = None
    issued_at: datetime | None = None
    days_overdue: int = 0


class BillingSummary(ORMModel):
    """KPI block for the billing desk."""

    billed: Decimal
    collected: Decimal
    outstanding: Decimal
    overdue: Decimal
    gst_charged: Decimal
    draft_value: Decimal
    invoice_count: int = 0
    status_counts: dict[str, int] = {}
    overdue_count: int = 0


#: Statuses the list endpoint accepts as a filter (whitelist, not free text).
INVOICE_STATUS_FILTERS = tuple(status.value for status in InvoiceStatus)
