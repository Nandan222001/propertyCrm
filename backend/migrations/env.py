"""Alembic environment.

* the URL always comes from :mod:`app.core.config` (12-factor, secret manager);
* ``compare_type``/``compare_server_default`` are on so drift is detected;
* migrations run with ``transaction_per_migration`` — a failed migration never
  leaves half a schema behind (MySQL DDL is not transactional, so each version
  is applied and stamped individually).
"""

from __future__ import annotations

import contextlib
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.models import Base

config = context.config
# Precedence: explicit URL (CLI ``-x db_url=...`` or programmatic
# ``config.set_main_option``) → application settings. Credentials therefore
# never need to live in alembic.ini, but tooling/tests can point migrations at
# a disposable database.
_explicit_url = context.get_x_argument(as_dictionary=True).get("db_url") or config.get_main_option(
    "sqlalchemy.url"
)
config.set_main_option("sqlalchemy.url", (_explicit_url or settings.database_url).replace("%", "%%"))
if config.config_file_name is not None:
    # logging config is optional (fileConfig needs a logging section)
    with contextlib.suppress(Exception):
        fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout (``alembic upgrade head --sql``) for DBAs to review."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=settings.connect_args,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
