"""Uniform success envelope + pagination helpers.

Every endpoint returns the same shape so the frontend HTTP layer has exactly one
contract to unwrap::

    {"success": true, "message": "...", "data": ..., "meta": {...}, "request_id": "..."}
"""

from __future__ import annotations

from collections.abc import Sequence
from math import ceil
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

from app.core.logging import request_id_var

T = TypeVar("T")


class PageMeta(BaseModel):
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)
    total: int = Field(ge=0)
    pages: int = Field(ge=0)
    has_next: bool = False
    has_prev: bool = False


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    meta: PageMeta


def build_page_meta(page: int, page_size: int, total: int) -> PageMeta:
    pages = ceil(total / page_size) if page_size else 0
    return PageMeta(
        page=page,
        page_size=page_size,
        total=total,
        pages=pages,
        has_next=page < pages,
        has_prev=page > 1,
    )


def paginate(items: Sequence[T], page: int, page_size: int, total: int) -> Paginated[T]:
    return Paginated[T](items=list(items), meta=build_page_meta(page, page_size, total))


def success(data: Any = None, message: str = "OK", meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Envelope used by controllers as the single return value."""
    body: dict[str, Any] = {
        "success": True,
        "message": message,
        "data": data,
        "request_id": request_id_var.get(),
    }
    if meta is not None:
        body["meta"] = meta
    return body


def paginated(payload: Paginated, message: str = "OK") -> dict[str, Any]:
    return success(
        data=payload.items,
        message=message,
        meta=payload.meta.model_dump(),
    )
