"""Generic repository: the only place that talks SQL.

Why a base repository instead of per-entity query code:
* every query is built through SQLAlchemy Core/ORM expressions — string SQL is
  never concatenated, which structurally removes ORDER BY / WHERE injection;
* pagination, sorting whitelists, soft-delete filtering and eager loading are
  implemented once and inherited (the DRY requirement of this codebase);
* services stay testable: they depend on repository interfaces, not on sessions.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Any, Generic, TypeVar

from sqlalchemy import Select, delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.responses import Paginated, paginate
from app.db.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """CRUD + search primitives shared by every concrete repository."""

    model: type[ModelT]
    #: Columns searchable via the ``q`` query parameter.
    searchable: tuple[str, ...] = ()
    #: Columns allowed in ``sort=field:asc`` (whitelist → no injection).
    sortable: dict[str, Any] = {}
    default_sort: str = "id"

    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------- helpers
    def _base_query(self, include_deleted: bool = False) -> Select:
        stmt = select(self.model)
        if not include_deleted and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.is_(False))
        return stmt

    def _apply_search(self, stmt: Select, term: str | None) -> Select:
        """LIKE search across the whitelisted columns (parameters are bound)."""
        if not term or not self.searchable:
            return stmt
        cleaned = term.strip()[:100]  # cap length: no giant LIKE payloads
        if not cleaned:
            return stmt
        pattern = f"%{cleaned}%"
        clauses = [getattr(self.model, column).like(pattern) for column in self.searchable]
        return stmt.where(or_(*clauses))

    def apply_filters(self, stmt: Select, filters: dict[str, Any] | None) -> Select:
        """Subclasses extend this to map query params onto columns."""
        for column, value in (filters or {}).items():
            if value is None or not hasattr(self.model, column):
                continue
            if isinstance(value, (list, tuple, set)):
                stmt = stmt.where(getattr(self.model, column).in_(list(value)))
            else:
                stmt = stmt.where(getattr(self.model, column) == value)
        return stmt

    def _apply_sort(self, stmt: Select, sort: str | None) -> Select:
        from app.core.validators import resolve_sort

        options = self.sortable or {"id": self.model.id}
        column, direction = resolve_sort(sort, options, self.default_sort)
        ordering = column.asc() if direction == "asc" else column.desc()
        # Secondary key keeps pagination stable for identical timestamps.
        secondary = self.model.id.desc() if direction == "desc" else self.model.id.asc()
        return stmt.order_by(ordering, secondary)

    # ---------------------------------------------------------------- CRUD
    def get(self, entity_id: int | str, *, include_deleted: bool = False) -> ModelT | None:
        stmt = self._base_query(include_deleted).where(self.model.id == entity_id)
        return self.db.execute(stmt).scalars().first()

    def get_or_404(self, entity_id: int | str, *, include_deleted: bool = False) -> ModelT:
        entity = self.get(entity_id, include_deleted=include_deleted)
        if entity is None:
            raise NotFoundError(f"{self.model.__name__} {entity_id} was not found")
        return entity

    def get_by(self, **criteria: Any) -> ModelT | None:
        stmt = self._base_query()
        for column, value in criteria.items():
            stmt = stmt.where(getattr(self.model, column) == value)
        return self.db.execute(stmt).scalars().first()

    def list(
        self,
        *,
        filters: dict[str, Any] | None = None,
        search: str | None = None,
        sort: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ModelT]:
        stmt = self._apply_sort(self.apply_filters(self._apply_search(self._base_query(), search), filters), sort)
        if limit is not None:
            stmt = stmt.limit(limit)
        if offset:
            stmt = stmt.offset(offset)
        return list(self.db.execute(stmt).scalars().unique().all())

    def paginate(
        self,
        *,
        page: int = 1,
        page_size: int = 25,
        filters: dict[str, Any] | None = None,
        search: str | None = None,
        sort: str | None = None,
        scope_clause: Any = None,
    ) -> Paginated[ModelT]:
        """Page + total count using a single WHERE clause (no N+1, no leaks)."""
        stmt = self.apply_filters(self._apply_search(self._base_query(), search), filters)
        if scope_clause is not None:
            stmt = stmt.where(scope_clause)
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = int(self.db.execute(count_stmt).scalar_one() or 0)
        rows = self.db.execute(
            self._apply_sort(stmt, sort).limit(page_size).offset((page - 1) * page_size)
        ).scalars().unique().all()
        return paginate(list(rows), page, page_size, total)

    def count(self, filters: dict[str, Any] | None = None, scope_clause: Any = None) -> int:
        stmt = self.apply_filters(self._base_query(), filters)
        if scope_clause is not None:
            stmt = stmt.where(scope_clause)
        return int(self.db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one() or 0)

    def create(self, entity: ModelT) -> ModelT:
        self.db.add(entity)
        self.db.flush()
        return entity

    def create_many(self, entities: Iterable[ModelT]) -> list[ModelT]:
        items = list(entities)
        self.db.add_all(items)
        self.db.flush()
        return items

    def update(self, entity: ModelT, values: dict[str, Any]) -> ModelT:
        for column, value in values.items():
            if not hasattr(entity, column) or column in {"id", "public_id"}:
                continue
            setattr(entity, column, value)
        self.db.flush()
        return entity

    def delete(self, entity: ModelT, *, actor: str | None = None, hard: bool = False) -> None:
        if hard or not hasattr(entity, "is_deleted"):
            self.db.delete(entity)
        else:
            entity.soft_delete(actor)  # type: ignore[attr-defined]
        self.db.flush()

    def bulk_status_update(self, ids: Sequence[int], **values: Any) -> int:
        """Explicit WHERE-clause update (never a blanket UPDATE)."""
        if not ids:
            return 0
        result = self.db.execute(
            update(self.model).where(self.model.id.in_(list(ids))).values(**values)
        )
        return int(result.rowcount or 0)

    def purge_soft_deleted(self, older_than: datetime) -> int:
        """Retention job: hard-delete rows soft-deleted before ``older_than``."""
        stmt = delete(self.model).where(
            self.model.is_deleted.is_(True), self.model.deleted_at < older_than
        )
        result = self.db.execute(stmt)
        return int(result.rowcount or 0)

    # ------------------------------------------------------------- helpers
    @staticmethod
    def now() -> datetime:
        return datetime.now(UTC)

    def exists(self, **criteria: Any) -> bool:
        return self.get_by(**criteria) is not None
