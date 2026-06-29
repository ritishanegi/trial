"""Initial schema: documents and ingestion_jobs tables

Derived from the raw SQL queries observed in app/services/db.py.
This migration creates the two core tables managed by the Python worker.

NOTE: The nautos-app uses Drizzle ORM to manage its own tables (users,
tenants, sessions, vessels, chat_sessions, etc.). This migration only covers
the tables that the Python worker reads and writes directly.

Revision ID: 0001
Revises:
Create Date: 2026-06-19 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enable required extensions ────────────────────────────────────────────
    # pgvector is used for embedding storage in other tables (managed elsewhere).
    # We ensure the extension exists here for completeness.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # ── documents table ───────────────────────────────────────────────────────
    # Core document registry. Populated by the Next.js app when a file is
    # uploaded. The worker reads this table and updates ocr_status / page_count.
    op.create_table(
        "documents",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
            comment="Primary key — also used as the S3 object prefix",
        ),
        sa.Column(
            "tenant_id",
            sa.UUID(as_uuid=True),
            nullable=False,
            index=True,
            comment="Owning tenant — all queries are scoped by this",
        ),
        sa.Column(
            "vessel_id",
            sa.UUID(as_uuid=True),
            nullable=True,
            index=True,
            comment="Optional vessel scope; NULL means fleet/master level",
        ),
        sa.Column(
            "title",
            sa.Text(),
            nullable=False,
            comment="Human-readable document title",
        ),
        sa.Column(
            "doc_type",
            sa.String(50),
            nullable=True,
            comment="Document type category (e.g. manual, regulation, certificate)",
        ),
        sa.Column(
            "scope",
            sa.String(20),
            nullable=False,
            server_default="vessel",
            comment="Retrieval scope: vessel | fleet | master",
        ),
        sa.Column(
            "s3_key",
            sa.Text(),
            nullable=False,
            comment="S3 object key of the uploaded PDF",
        ),
        sa.Column(
            "ocr_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
            comment="OCR pipeline status: pending | processing | complete | failed",
        ),
        sa.Column(
            "page_count",
            sa.Integer(),
            nullable=True,
            comment="Total page count (set after OCR completes)",
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "scope IN ('vessel', 'fleet', 'master')",
            name="documents_scope_check",
        ),
        sa.CheckConstraint(
            "ocr_status IN ('pending', 'processing', 'complete', 'failed')",
            name="documents_ocr_status_check",
        ),
    )

    # ── ingestion_jobs table ──────────────────────────────────────────────────
    # Tracks the progress of each Celery ingestion task.
    # Written by the worker via app/services/db.py — update_job_status().
    op.create_table(
        "ingestion_jobs",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
            comment="One job per document",
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
            comment="Job status: pending | processing | complete | failed",
        ),
        sa.Column(
            "progress",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Progress percentage 0–100",
        ),
        sa.Column(
            "total_pages",
            sa.Integer(),
            nullable=True,
            comment="Set once OCR determines the page count",
        ),
        sa.Column(
            "processed_pages",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Number of pages successfully processed so far",
        ),
        sa.Column(
            "error",
            sa.Text(),
            nullable=True,
            comment="Error message if status=failed",
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "started_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
            comment="Set when the Celery worker picks up the task",
        ),
        sa.Column(
            "completed_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
            comment="Set when status becomes complete or failed",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'complete', 'failed')",
            name="ingestion_jobs_status_check",
        ),
        sa.CheckConstraint(
            "progress BETWEEN 0 AND 100",
            name="ingestion_jobs_progress_range_check",
        ),
    )

    # ── Indexes ───────────────────────────────────────────────────────────────
    op.create_index(
        "ix_documents_tenant_ocr_status",
        "documents",
        ["tenant_id", "ocr_status"],
        comment="Common filter: all pending/failed jobs for a tenant",
    )
    op.create_index(
        "ix_ingestion_jobs_status",
        "ingestion_jobs",
        ["status"],
        comment="Queue drain: find all pending jobs",
    )


def downgrade() -> None:
    op.drop_index("ix_ingestion_jobs_status", table_name="ingestion_jobs")
    op.drop_index("ix_documents_tenant_ocr_status", table_name="documents")
    op.drop_table("ingestion_jobs")
    op.drop_table("documents")
