"""Database bootstrap: create tables from metadata and (optionally) seed demo data.

Used by ``python -m app.db.init_db`` and by the app lifespan in local/test.
Production migrations are handled by Alembic (``alembic upgrade head``) — this
module intentionally does **not** replace them, it only makes local runs turnkey.
"""

from __future__ import annotations

import logging

from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import get_engine, session_scope
from app.models import Base  # importing registers all models

logger = logging.getLogger(__name__)


def create_tables() -> None:
    Base.metadata.create_all(bind=get_engine())
    logger.info("Schema ensured (%d tables)", len(Base.metadata.tables))


def bootstrap_database(*, seed_demo: bool = False) -> None:
    """Ensure schema exists, then seed a working dataset when asked."""
    create_tables()
    if seed_demo:
        from app.db.seed import seed_all

        with session_scope() as session:
            seed_all(session)


def main() -> None:  # pragma: no cover - CLI entry point
    configure_logging()
    print(f"Bootstrapping {settings.DB_DIALECT} database '{settings.DB_NAME}' …")
    bootstrap_database(seed_demo=settings.ENVIRONMENT in {"local", "test"})
    print("Done. Sign in with an account from docs/DEPLOYMENT.md (demo passwords are dev-only).")


if __name__ == "__main__":  # pragma: no cover
    main()
