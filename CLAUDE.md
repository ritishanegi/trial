# NAUTOS AI — Persistent context for Claude

Read this every session. The companion docs go deeper:

- **`docs/STRUCTURE.md`** — folder organization (start here to understand what lives where)
- **`docs/DEVELOPMENT.md`** — local dev setup and troubleshooting
- **`docs/API.md`** — REST endpoint reference
- **`ARCHITECTURE.md`** — full file map, request flows, env vars
- **`ROADMAP.md`** — 4-phase plan (all shipped, kept as reference)
- **`AUDIT.md`** — production logic audit, severity-rated. Open critical bugs listed below.

---

## What this is

**NAUTOS AI** is a multi-tenant maritime document intelligence SaaS for Martech Systems.
Ship engineers upload PDFs (parts catalogs, maintenance manuals) and ask questions in
natural language. The system uses RAG (hybrid keyword + vector search) plus an LLM to
return answers with page-level citations.

Pre-production. The user is Vrushabh, a solo dev at Martech building this to scale to
many maritime clients. Quality and reliability matter — engineers will trust answers
to maintain equipment that costs millions.

---

## Stack at a glance

```
services/frontend/   Next.js 15 frontend UI only
services/api/        Next.js 15 REST API endpoints + server logic
services/worker/     Python 3.12 FastAPI + Celery — OCR, embeddings, RAG, LLM, Excel export
db/migrations/       SQL migrations (single source of truth for schema)
infra/               Docker Compose configs
```

External services:
- **Azure Document Intelligence** — OCR (prebuilt-layout model)
- **Voyage AI voyage-3-large** — embeddings (1024-dim, paid card, 200M free tokens)
- **Groq llama-3.3-70b-versatile** — LLM (dev default, free tier 12K TPM)
- **Anthropic Claude Sonnet** — LLM (production target, swap via `LLM_PROVIDER=anthropic`)
- **Gemini 1.5 Flash** — LLM (fallback option, 1M TPM free)
- **AWS S3** — document storage (ap-south-1, bucket `nautos-documents-martech`)
- **Resend** — transactional email

---

## Non-negotiable invariants

These keep the system safe and correct. Don't violate them.

1. **Every API route under `nautos-app/src/app/api/`** (except `auth/*` and `health`) calls `requireTenant(req)` from `@/lib/server/api-helpers` first. No exceptions.
2. **Every DB query — Drizzle or raw SQL — filters by `tenantId`/`tenant_id`.** Cross-tenant data leaks are the #1 thing to prevent.
3. **Vector embeddings are 1024-dimensional.** Voyage's `voyage-3-large` outputs 1024. Postgres schema is `vector(1024)`. If you ever change embedding model, you must also change the schema and re-embed every document. Don't change one without the other.
4. **Worker `services/` is pure business logic.** `tasks/` are Celery wrappers, `routes/` are FastAPI wrappers. Don't put logic in tasks or routes.
5. **`config.py` is the only place that reads env vars in the worker.** Everything else imports `settings`.
6. **`shared/migrations/*.sql` is the source of truth for the schema.** Both Drizzle (`nautos-app/src/lib/db/schema.ts`) and the worker must match. If you change one, change them all.
7. **Never commit `.env`** — it's gitignored. `.env.example` is the template.
8. **LLM provider is swappable via `LLM_PROVIDER` env var.** Add new providers to the `_PROVIDERS` registry in `services/retrieval/llm.py`, don't hardcode anywhere.

---

## Tribal knowledge accumulated this week

Things that already cost us hours — don't relearn them.

### Docker / dev environment

- **Container `node_modules` is from the image build, not the host.** Running `pnpm add X` on the host installs to host node_modules but the running container doesn't see it. Either rebuild the image or `docker compose exec app pnpm add X`.
- **Tailwind v4 uses `@plugin "..."` in `globals.css`**, not `tailwind.config.js`. There is no tailwind.config.* file.
- **Worker uses uvicorn `--reload`** so Python file edits hot-swap. But changing `pyproject.toml` requires `docker compose build worker-api worker-celery` to install the new deps.
- **Elasticsearch client must be `<9.0.0`** because the ES server is 8.17. Newer client sends a `compatible-with=9` header that ES 8 rejects.

### LLM gotchas

- **Groq's TPM accounting includes `max_tokens` reserved for output**, not just input. We capped `max_tokens=4000` in `services/retrieval/llm.py` so that a ~5K-token input still fits under the 12K TPM free-tier cap.
- **Groq's free tier is per-minute cumulative across requests.** Multiple test attempts in quick succession compound and hit the cap even if any single request is small.
- **Gemini free tier behaved oddly with auto-generated GCP projects** — got `limit: 0` quota errors. A fresh AI Studio key in a fresh project worked. If we ever switch back to Gemini, create the key in a clean project.
- **Llama 3.3 70B will hallucinate part numbers under pressure** more than Claude. For production, switch `LLM_PROVIDER=anthropic`. The provider abstraction in `llm.py` makes this a one-env-var change.

### RAG quirks

- **RRF scores in `services/retrieval/rag.py` cap at ~`1/(RRF_K+1)` per source** (~0.016 with `RRF_K=60`). A chunk that hits both keyword + vector search at rank 0 maxes at ~0.033, boosted to ~0.038. The `SCORE_THRESHOLD` is 0.005 — set it higher and you filter out everything. The comment explains the math.
- **Document-scoped mode bypasses RRF, top-K, and the score threshold entirely.** When `document_id` is in the query, the worker retrieves all chunks ordered by page and feeds the whole document to the LLM. Used by "Ask about this document" and the Excel export.

### Frontend quirks

- **`history.replaceState` doesn't reliably keep React state stable** with Next.js App Router. The scope pill on `/dashboard/query` disappears on the first message of a doc-scoped chat. We worked around it by locking the initial scope in `useState` inside `ChatInterface`, but it still flickers briefly. After page refresh it's fine.
- **Custom DOM event `nautos:sessions-updated`** is dispatched by `ChatInterface` after session create / stream complete / rename / delete. `SessionsSidebar` listens and refetches. Defined in `components/chat/chat-interface.tsx`.
- **`/dashboard/query/[sessionId]/page.tsx` mounts a fresh `ChatInterface`** with `scopedDocumentId` from the DB-stored session, not from URL params. The session's `document_id` is the authoritative source.

---

## Open critical bugs (from AUDIT.md — fix before paying customers)

| ID | What | Where |
|----|------|-------|
| **C1** | Ingestion re-runs duplicate embeddings (we see 33 vectors vs 6 ES chunks) | `nautos-worker/app/tasks/ingestion.py` — needs idempotency |
| **C2** | `vesselId` accepted from client without tenant ownership check | `nautos-app/src/app/api/documents/upload/route.ts`, `equipment/route.ts` |
| **C3** | Multi-step writes have no transactions — orphan risk on partial failure | `upload/route.ts`, `query/route.ts` |
| **C4** | Chat history fetch has no LIMIT — sends entire conversation just to truncate worker-side | `query/route.ts:57-61` |
| **H1** | Documents list endpoint has no pagination | `documents/route.ts` |
| **H2** | Elasticsearch `index_chunks` doesn't dedupe either (same root as C1) | `services/retrieval/search.py` |
| **H4** | No automatic LLM fallback when Groq hits TPM cap | `services/retrieval/llm.py` |
| **H7** | JWT dev-default secret is in source code — single env var miss = full auth bypass | `nautos-app/src/middleware.ts`, `lib/auth/index.ts` |

Full severity-rated list and fix suggestions in `AUDIT.md`.

---

## Features not yet built (from original handover doc)

These were in the technical handover but are not implemented. Don't pretend they exist:

- Master library promotion (admin approve/reject pipeline for shared docs)
- Onboarding flow (invite tokens, signup with token, progress checklist)
- White-label branding UI (custom domain, logo, colors per tenant)
- Document PATCH/DELETE endpoints
- Equipment PATCH endpoint, vessel soft-delete
- Auth refresh tokens, admin user creation (`POST /auth/register-user`)
- Query filters by `doc_types` / `version_filter`
- PII stripping logic (regex exists in `services/privacy.py` but `master_library` promotion never calls it)
- Seed script (`make seed`) for demo data

---

## How to ask me to do things

- **Want to commit?** I won't commit unless you say so explicitly. I write good multi-line messages with `Co-Authored-By: Claude` trailer.
- **Want production-quality code?** Default for this project. Lower temperature, defensive coding, prefer transactions, validate inputs with Zod / Pydantic.
- **Want a quick prototype?** Tell me, and I'll skip the defensive checks.
- **Want me to run things?** I have `docker compose` access. I prefer testing in the actual browser via the Claude in Chrome connector when available.
- **Anything destructive** (DB drops, `git reset --hard`, force pushes, secrets in commits) — I will refuse or ask first.

---

## Useful commands

```bash
docker compose logs -f worker-celery               # watch worker tasks
docker compose logs -f app                         # watch Next.js
docker compose exec postgres psql -U nautos_user -d nautos    # DB shell
docker compose restart worker-api worker-celery    # after llm.py changes
docker compose build worker-api worker-celery      # after pyproject.toml changes
cd nautos-app && npx tsc --noEmit                  # TypeScript type check
```

If a Postgres query is needed and you can't access the container, the schema is in
`shared/migrations/001_initial_schema.sql` + `003_chat_sessions.sql`.
