"""Database bootstrap: create tables from metadata. No data is ever loaded.

Used by ``python -m app.db.init_db`` and by the app lifespan in local/test.
Production migrations are handled by Alembic (``alembic upgrade head``) — this
module intentionally does **not** replace them, it only makes local runs turnkey.
"""

from __future__ import annotations

import logging

from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import get_engine
from app.models import Base  # importing registers all models

logger = logging.getLogger(__name__)


def create_tables() -> None:
    Base.metadata.create_all(bind=get_engine())
    logger.info("Schema ensured (%d tables)", len(Base.metadata.tables))


def bootstrap_database() -> None:
    """Ensure the schema exists. Organisations and users are created through the application."""
    create_tables()


def main() -> None:  # pragma: no cover - CLI entry point
    configure_logging()
    print(f"Bootstrapping {settings.DB_DIALECT} database '{settings.DB_NAME}' …")
    bootstrap_database()
    print("Done. Create the first platform owner with: python -m app.db.create_platform_admin")


if __name__ == "__main__":  # pragma: no cover
    main()
