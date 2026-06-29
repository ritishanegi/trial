"""
sentry_init.py — Sentry initialisation for nautos-worker

Call `init_sentry()` exactly once at application startup, before any other
imports that might raise exceptions. This module handles both:

  1. FastAPI / uvicorn process  →  import from main.py
  2. Celery worker process      →  import from celery_app.py

Usage in main.py:
    from sentry_init import init_sentry
    init_sentry()

Usage in celery_app.py:
    from sentry_init import init_sentry
    init_sentry(runtime="celery")

Required environment variables (add to .env and k8s Secrets):
    SENTRY_DSN          — Sentry project DSN
    SENTRY_ENVIRONMENT  — overrides NODE_ENV / ENVIRONMENT (optional)
    SENTRY_RELEASE      — git SHA or semver tag (optional, set in CI)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _scrub_pii(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:  # noqa: ARG001
    """
    before_send hook: strip sensitive maritime/tenant fields before sending
    events to Sentry. Called synchronously for every captured exception.

    Fields scrubbed:
      - request body keys: password, token, jwt, api_key
      - extra context: raw embeddings (large + potentially identifying)
    """
    # ── Scrub request body ────────────────────────────────────────────────────
    request = event.get("request", {})
    if isinstance(request.get("data"), dict):
        sensitive_keys = {"password", "token", "jwt", "api_key", "secret", "credential"}
        event["request"]["data"] = {
            k: "[Filtered]" if k.lower() in sensitive_keys else v
            for k, v in request["data"].items()
        }

    # ── Scrub extra context ───────────────────────────────────────────────────
    extra = event.get("extra", {})
    # Drop raw embedding vectors (can be thousands of floats — large + noisy)
    if "query_vector" in extra:
        event["extra"]["query_vector"] = f"[{len(extra['query_vector'])}d vector omitted]"
    if "embeddings" in extra:
        event["extra"]["embeddings"] = "[embeddings omitted]"

    return event


def _before_send_transaction(
    event: dict[str, Any], hint: dict[str, Any]  # noqa: ARG001
) -> dict[str, Any] | None:
    """
    before_send_transaction hook: drop high-volume health-check transactions
    to avoid polluting performance data.
    """
    transaction = event.get("transaction", "")
    if transaction in ("/health", "/metrics", "/favicon.ico"):
        return None
    return event


def init_sentry(runtime: str = "fastapi") -> None:
    """
    Initialise the Sentry SDK.

    Args:
        runtime: "fastapi" (default) or "celery". Controls which integrations
                 are activated. Use "celery" in celery_app.py signal hooks.
    """
    dsn = os.getenv("SENTRY_DSN", "")
    if not dsn:
        logger.info("SENTRY_DSN not set — Sentry is disabled.")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.redis import RedisIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logger.warning("sentry-sdk not installed. Run: uv add sentry-sdk")
        return

    environment = os.getenv("SENTRY_ENVIRONMENT") or os.getenv("ENVIRONMENT", "development")
    release = os.getenv("SENTRY_RELEASE", "")
    is_production = environment == "production"

    # ── Integrations ──────────────────────────────────────────────────────────
    integrations = [
        # Capture Python logging at WARNING+ as Sentry breadcrumbs
        LoggingIntegration(
            level=logging.WARNING,       # breadcrumbs from WARNING+
            event_level=logging.ERROR,   # send as Sentry event at ERROR+
        ),
        # Redis errors and slow commands
        RedisIntegration(),
        # SQLAlchemy query spans (useful when Alembic or SA is used)
        SqlalchemyIntegration(),
    ]

    if runtime == "fastapi":
        integrations.extend([
            StarletteIntegration(transaction_style="url"),
            FastApiIntegration(transaction_style="url"),
        ])
    elif runtime == "celery":
        integrations.append(
            CeleryIntegration(
                monitor_beat_tasks=True,   # Sentry Crons — alerts on missed beat tasks
                propagate_traces=True,     # link Celery task traces to their HTTP triggers
            )
        )

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release or None,
        integrations=integrations,

        # ── Sampling ─────────────────────────────────────────────────────────
        # Lower in production to keep costs down; full coverage in dev/staging
        traces_sample_rate=0.2 if is_production else 1.0,
        profiles_sample_rate=0.1 if is_production else 1.0,

        # ── Hooks ────────────────────────────────────────────────────────────
        before_send=_scrub_pii,
        before_send_transaction=_before_send_transaction,

        # ── PII ──────────────────────────────────────────────────────────────
        send_default_pii=False,

        # ── Ignore well-known noise ───────────────────────────────────────────
        ignore_errors=[
            # Client disconnects before response is complete (not a server bug)
            ConnectionResetError,
            BrokenPipeError,
        ],
    )

    logger.info(
        "Sentry initialised | runtime=%s env=%s release=%s",
        runtime,
        environment,
        release or "unset",
    )


# ── Convenience helpers ────────────────────────────────────────────────────────


def capture_ingestion_error(document_id: str, exc: BaseException) -> None:
    """
    Structured error capture for ingestion pipeline failures.
    Attaches document_id as a tag so errors are filterable in the Sentry UI.

    Usage in Celery tasks:
        from sentry_init import capture_ingestion_error
        try:
            ...
        except Exception as e:
            capture_ingestion_error(document_id, e)
            raise
    """
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("document_id", document_id)
            scope.set_tag("pipeline_stage", "ingestion")
            scope.set_context("ingestion", {"document_id": document_id})
            sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to report ingestion error to Sentry")


def capture_rag_error(tenant_id: str, exc: BaseException, question_hash: str = "") -> None:
    """
    Structured error capture for RAG query failures.
    Attaches tenant_id (not the raw question — PII risk) as a tag.
    """
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("tenant_id", tenant_id)
            scope.set_tag("pipeline_stage", "rag_query")
            if question_hash:
                scope.set_tag("question_hash", question_hash)
            sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to report RAG error to Sentry")
