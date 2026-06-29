"""
Alembic environment configuration for nautos-worker.

This env.py supports:
- Offline mode: generates SQL migration scripts (no live DB connection needed)
- Online mode: applies migrations against a live PostgreSQL connection

The database URL is read from the DATABASE_URL environment variable (via
app.config.settings) rather than the alembic.ini placeholder. This keeps
credentials out of version control.

Usage:
    # Apply pending migrations to the database
    uv run alembic upgrade head

    # Generate a new migration (autogenerate from SQLAlchemy models)
    uv run alembic revision --autogenerate -m "add_my_table"

    # Generate a SQL-only migration script for review/DBA approval
    uv run alembic upgrade head --sql > migration.sql
"""

from __future__ import annotations

import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text

from alembic import context

# ---------------------------------------------------------------------------
# Load the alembic.ini logging config
# ---------------------------------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# ---------------------------------------------------------------------------
# Import the SQLAlchemy MetaData for autogenerate support.
#
# nautos-worker currently uses raw psycopg (no ORM).
# To enable autogenerate, define your table structures using SQLAlchemy Core
# and set `target_metadata` to the MetaData instance.
#
# Example:
#   from app.db.metadata import metadata as target_metadata
#
# For now we use None, which means migrations are written by hand.
# ---------------------------------------------------------------------------
target_metadata = None

# ---------------------------------------------------------------------------
# Override the database URL from the environment (via pydantic-settings).
# This takes precedence over the placeholder in alembic.ini.
# ---------------------------------------------------------------------------


def get_database_url() -> str:
    """
    Return the database URL from app settings (reads DATABASE_URL env var).
    Falls back to the alembic.ini value if settings cannot be loaded.
    """
    try:
        from app.config import settings  # noqa: PLC0415

        return settings.database_url
    except Exception:  # noqa: BLE001
        logger.warning(
            "Could not load app.config.settings — falling back to alembic.ini URL."
        )
        return config.get_main_option("sqlalchemy.url", "")


# ---------------------------------------------------------------------------
# Offline migrations (generates SQL without connecting to the DB)
# ---------------------------------------------------------------------------


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    This produces a SQL script that a DBA can review and apply manually.
    No live database connection is required.
    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Include schema changes in autogenerate comparisons
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online migrations (applies directly to the live database)
# ---------------------------------------------------------------------------


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.

    Creates a SQLAlchemy engine connection and applies pending migrations.
    """
    url = get_database_url()

    # Override the sqlalchemy.url in the config so engine_from_config picks it up
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # NullPool is correct for migration scripts
    )

    with connectable.connect() as connection:
        # Ensure pgvector extension is available (required for vector columns)
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
