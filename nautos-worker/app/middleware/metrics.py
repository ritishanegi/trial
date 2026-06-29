"""
app/middleware/metrics.py

Registers Prometheus metrics on the FastAPI application using
prometheus-fastapi-instrumentator. Call `instrument_app(app)` from main.py
after all routers are registered.

This exposes a /metrics endpoint in the Prometheus exposition format,
scraped by the Prometheus container every 10 seconds.

Installation:
    uv add prometheus-fastapi-instrumentator

Metrics exposed (default set + custom):
  http_requests_total                — counter: total HTTP requests by method, handler, status
  http_request_duration_seconds      — histogram: request latency buckets
  http_requests_inprogress           — gauge: requests currently in progress
  http_request_size_bytes            — histogram: request body size
  http_response_size_bytes           — histogram: response body size
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

logger = logging.getLogger(__name__)


def instrument_app(app: FastAPI) -> None:
    """
    Attach Prometheus instrumentation to a FastAPI app.

    Registers /metrics with the full default metric set plus custom latency
    buckets appropriate for RAG workloads (which can take 2–30 seconds).

    Args:
        app: The FastAPI application instance to instrument.
    """
    try:
        from prometheus_fastapi_instrumentator import Instrumentator  # noqa: PLC0415
        from prometheus_fastapi_instrumentator.metrics import (  # noqa: PLC0415
            combined_size,
            default,
            latency,
            requests,
        )
    except ImportError:
        logger.warning(
            "prometheus-fastapi-instrumentator not installed. "
            "Run: uv add prometheus-fastapi-instrumentator\n"
            "Metrics endpoint (/metrics) will NOT be available."
        )
        return

    # Custom latency buckets for RAG — spans from fast cache hits (50ms)
    # to slow OCR/embedding/LLM calls (up to 60 seconds).
    rag_latency_buckets = (
        0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 30.0, 60.0, float("inf")
    )

    (
        Instrumentator(
            # Exclude health and metrics endpoints from latency histograms
            # to avoid polluting percentile calculations
            excluded_handlers=["/health", "/metrics", "/docs", "/openapi.json"],
            # Group 404s together instead of one series per unknown path
            group_paths=True,
        )
        .add(requests())
        .add(latency(buckets=rag_latency_buckets))
        .add(combined_size())
        .instrument(app)
        .expose(
            app,
            endpoint="/metrics",
            include_in_schema=False,   # hide from Swagger UI
            tags=["observability"],
        )
    )

    logger.info("Prometheus metrics endpoint registered at /metrics")
