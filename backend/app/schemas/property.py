"""Project / plot / document schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator

from app.core.constants import DocumentKind, PlotStatus
from app.core.validators import clean_text, normalise_enum, to_decimal
from app.schemas.common import Money, ORMModel, SafeText, TimestampedResponse


class ProjectBase(SafeText):
    name: str = Field(min_length=2, max_length=120)
    phase: str | None = Field(default=None, max_length=60)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    location: str | None = Field(default=None, max_length=160)
    rera_number: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=2000)
    base_rate_per_sqft: Money | None = None
    launch_date: date | None = None
    completion_date: date | None = None
    is_active: bool = True


class ProjectCreate(ProjectBase):
    total_plots: int = Field(default=0, ge=0, le=100_000)
    estimated_revenue: Money | None = None


class ProjectUpdate(ProjectBase):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    total_plots: int | None = Field(default=None, ge=0, le=100_000)
    estimated_revenue: Money | None = None


class ProjectResponse(TimestampedResponse):
    public_id: str
    name: str
    phase: str | None = None
    city: str | None = None
    location: str | None = None
    rera_number: str | None = None
    total_plots: int = 0
    base_rate_per_sqft: Decimal | None = None
    estimated_revenue: Decimal | None = None
    is_active: bool = True
    plot_counts: dict[str, int] = Field(default_factory=dict)


class PlotBase(SafeText):
    layout: str | None = Field(default=None, max_length=80)
    facing: str | None = Field(default=None, max_length=24)
    area_sqft: Decimal = Field(gt=0, le=1_000_000)
    price: Money
    status: PlotStatus = PlotStatus.AVAILABLE


class PlotCreate(PlotBase):
    plot_number: str = Field(min_length=1, max_length=24)
    project_id: int = Field(gt=0)
    agent_code: str | None = Field(default=None, max_length=16)

    @field_validator("plot_number")
    @classmethod
    def _plot_number(cls, value: str) -> str:
        cleaned = clean_text(value, max_length=24).upper()
        if not cleaned:
            raise ValueError("plot number is required")
        return cleaned


class PlotUpdate(SafeText):
    layout: str | None = Field(default=None, max_length=80)
    facing: str | None = Field(default=None, max_length=24)
    area_sqft: Decimal | None = Field(default=None, gt=0, le=1_000_000)
    price: Money | None = None
    status: PlotStatus | None = None


class PlotStatusUpdate(SafeText):
    status: str
    reason: str | None = Field(default=None, max_length=255)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return normalise_enum(value, [s.value for s in PlotStatus], field="status")


class PlotResponse(TimestampedResponse):
    public_id: str
    plot_number: str
    project_id: int
    project_name: str | None = None
    layout: str | None = None
    area_sqft: Decimal
    facing: str | None = None
    price: Decimal
    status: str
    customer_id: int | None = None
    agent_id: int | None = None
    hold_expires_at: datetime | None = None


class InventoryResponse(ORMModel):
    summary: dict[str, int]
    total_value: float
    by_project: list[dict]


class DocumentCreate(SafeText):
    title: str = Field(min_length=2, max_length=160)
    kind: DocumentKind = DocumentKind.OTHER
    customer_id: int | None = Field(default=None, gt=0)
    booking_id: int | None = Field(default=None, gt=0)
    content_type: str | None = Field(default=None, max_length=80)
    size_bytes: int | None = Field(default=None, ge=0, le=50 * 1024 * 1024)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    file_key: str | None = Field(default=None, max_length=255)


class DocumentUpdate(SafeText):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    is_shared_with_customer: bool | None = None


class DocumentResponse(TimestampedResponse):
    public_id: str
    title: str
    kind: str
    customer_id: int | None = None
    booking_id: int | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    is_shared_with_customer: bool = False


def plot_price_from_rate(*, area_sqft: Decimal | float, rate: Decimal | float) -> Decimal:
    """Single formula for derived pricing (used by project/master services)."""
    return to_decimal(Decimal(str(area_sqft)) * Decimal(str(rate)), minimum=Decimal("0"))
