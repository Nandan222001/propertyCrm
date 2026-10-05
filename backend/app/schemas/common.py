"""Shared Pydantic building blocks: envelopes, pagination, reusable field types."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings
from app.core.validators import clean_text, normalise_mobile, to_decimal, validate_email

T = TypeVar("T")

# ------------------------------------------------------------------ types
Money = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2, description="Amount in INR")]
PageSize = Annotated[int, Field(ge=1, le=200, description="Rows per page (max 200)")]
PageNumber = Annotated[int, Field(ge=1, description="1-based page number")]


class ORMModel(BaseModel):
    """Base for response models read straight from SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, use_enum_values=True)


class RequestModel(BaseModel):
    """Base for inputs: unknown fields are rejected, strings are stripped."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, validate_assignment=True)


class SafeText(RequestModel):
    """Mix-in helper that sanitises every string field declared by a subclass."""

    @field_validator("*", mode="before")
    @classmethod
    def _sanitise_strings(cls, value: Any, info):
        if isinstance(value, str):
            limit = 2000 if info.field_name in {"notes", "description", "body", "details", "address"} else 255
            return clean_text(value, max_length=limit, allow_newlines=True)
        return value


class EmailField(RequestModel):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return validate_email(value)


class MobileField(RequestModel):
    phone: str = Field(max_length=20)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalise_mobile(value)


class MoneyField(RequestModel):
    amount: Money

    @field_validator("amount", mode="before")
    @classmethod
    def _amount(cls, value: Any) -> Decimal:
        return to_decimal(value, minimum=Decimal("0"))


# ------------------------------------------------------------- envelopes
class ApiError(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    details: Any | None = None


class ApiEnvelope(BaseModel, Generic[T]):
    """Documentation-only model so OpenAPI shows the real response shape."""

    success: bool = True
    message: str = "OK"
    data: T | None = None
    meta: dict[str, Any] | None = None
    request_id: str | None = None


class MessageResponse(BaseModel):
    message: str = "OK"


class IdResponse(BaseModel):
    public_id: str
    id: int


class PaginationParams(BaseModel):
    page: PageNumber = 1
    page_size: PageSize = 25
    search: str | None = Field(default=None, max_length=100)
    sort: str | None = Field(default=None, max_length=40, description="field:asc|desc")

    @field_validator("search")
    @classmethod
    def _search(cls, value: str | None) -> str | None:
        return clean_text(value, max_length=100) if value else None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class DateRangeParams(BaseModel):
    start: date | None = None
    end: date | None = None

    @field_validator("end")
    @classmethod
    def _ordered(cls, value: date | None, info):
        start = info.data.get("start")
        if value and start and value < start:
            raise ValueError("end date must be on or after the start date")
        return value


class TimestampedResponse(ORMModel):
    id: int
    created_at: datetime
    updated_at: datetime | None = None


class Masked(BaseModel):
    """Marker mix-in for responses that may contain masked PII."""

    masked: bool = Field(default=True, description="True when PII fields are masked")


def default_page_size() -> int:
    return min(settings.DB_POOL_SIZE * 2, 50)
