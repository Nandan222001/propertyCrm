"""Controller base: uniform envelope, pagination wiring, error translation.

Controllers are intentionally thin — they translate HTTP concerns (status codes,
envelopes, response models) into service calls. Business rules live in services,
SQL lives in repositories.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, Generic, TypeVar

from fastapi import status

from app.core.context import PaginationContext
from app.core.responses import Paginated, success
from app.services.base_service import BaseService

ServiceT = TypeVar("ServiceT", bound=BaseService)
ResponseT = TypeVar("ResponseT")


class BaseController(Generic[ServiceT]):
    resource: str = "resource"
    service_class: type[ServiceT]
    serialiser: Callable[[Any], Any] | None = None

    def __init__(self, service: ServiceT) -> None:
        self.service = service

    # ------------------------------------------------------------- responses
    def ok(self, data: Any = None, message: str = "OK", meta: dict | None = None) -> dict:
        return success(data, message, meta)

    def created(self, data: Any, message: str | None = None) -> dict:
        return success(data, message or f"{self.resource.capitalize()} created")

    def page(self, paginated: Paginated, *, serialise: bool = True, message: str = "OK") -> dict:
        items = paginated.items
        if serialise and self.serialiser is not None:
            items = [self.serialiser(item) for item in items]
        payload = Paginated(items=items, meta=paginated.meta)
        return success(
            data=payload.items,
            message=message,
            meta=payload.meta.model_dump(),
        )

    # ------------------------------------------------------------------ CRUD
    def list(self, page: PaginationContext) -> dict:
        return self.page(self.service.list(page))

    def detail(self, entity_id: int) -> dict:
        entity = self.service.get(entity_id)
        return self.ok(self.serialiser(entity) if self.serialiser else entity)

    def create(self, values: dict) -> dict:
        entity = self.service.create(values)
        return self.created(self.serialiser(entity) if self.serialiser else entity)

    def update(self, entity_id: int, values: dict) -> dict:
        entity = self.service.update(entity_id, values)
        return self.ok(self.serialiser(entity) if self.serialiser else entity, f"{self.resource.capitalize()} updated")

    def delete(self, entity_id: int) -> dict:
        self.service.delete(entity_id)
        return self.ok(None, f"{self.resource.capitalize()} deleted")

    # --------------------------------------------------------------- helpers
    @staticmethod
    def bulk(actions: Sequence[Callable[[], Any]]) -> list[Any]:
        """Apply several service calls in one request (used by bulk endpoints)."""
        return [action() for action in actions]


STATUS_CREATED = status.HTTP_201_CREATED
