"""Engine / session management.

* One process-wide engine per worker with ``pool_pre_ping`` (survives MySQL
  ``wait_timeout``), ``pool_recycle`` and a bounded pool so a traffic spike can
  never exhaust MySQL's ``max_connections``.
* ``session_scope`` gives services a transactional boundary with automatic
  commit/rollback; API handlers use the ``get_db`` dependency.
* ``read_only`` sessions are used by report endpoints to keep analytics off the
  write path (and can be pointed at a MySQL replica).
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_engine: Engine | None = None


def _create_engine() -> Engine:
    engine_kwargs: dict = {
        "echo": settings.DB_ECHO,
        "future": True,
        "pool_pre_ping": True,
        "connect_args": settings.connect_args,
    }
    if settings.DB_DIALECT == "mysql":
        engine_kwargs.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_recycle=settings.DB_POOL_RECYCLE,
        )
    engine = create_engine(settings.database_url, **engine_kwargs)

    if settings.DB_DIALECT == "sqlite":
        # SQLite is only used by the test suite / quick local runs.
        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    logger.info(
        "Database engine ready",
        extra={"event": "db.engine_ready", "resource": settings.DB_DIALECT},
    )
    return engine


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _create_engine()
    return _engine


def dispose_engine() -> None:
    """Close pooled connections (called on shutdown and by tests)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None


SessionLocal = sessionmaker(
    bind=None, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session
)


def get_session_factory() -> sessionmaker:
    if SessionLocal.kw.get("bind") is None:
        SessionLocal.configure(bind=get_engine())
    return SessionLocal


# FastAPI dependency ------------------------------------------------------
def get_db() -> Iterator[Session]:
    """Yield a request-scoped session with an explicit unit of work.

    The transaction is committed only when the endpoint returns successfully:
    a raised error (validation, permission, business rule) rolls the whole
    request back, so a partially-applied workflow can never be persisted.
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for scripts, seeds and background jobs."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@event.listens_for(Session, "do_orm_execute")
def _block_unscoped_bulk_delete(execute_state) -> None:
    """Defence in depth: refuse ORM-level DELETE/UPDATE without a WHERE clause."""
    if execute_state.is_delete or execute_state.is_update:
        statement = execute_state.statement
        if statement is not None and getattr(statement, "whereclause", None) is None:
            raise RuntimeError("Refusing to execute an unscoped UPDATE/DELETE statement")
