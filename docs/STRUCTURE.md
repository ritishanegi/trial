# NAUTOS FOLDER STRUCTURE

Clear, organized layout for solo dev + future team growth.

---

## TOP-LEVEL VIEW

```
nautos/
├── services/          ← All code (organized by domain)
├── db/                ← Database migrations
├── docs/              ← Documentation (this file lives here)
├── infra/             ← Deployment configs
├── CLAUDE.md          ← Claude documentation
├── AUDIT.md           ← Security audit log
├── ROADMAP.md         ← Feature roadmap
└── Makefile           ← Dev commands
```

---

## SERVICES/ — WHERE THE CODE LIVES

### `services/frontend/`
**Next.js UI only** — React components, pages, static assets.

```
services/frontend/
├── src/app/
│   ├── (dashboard)/     ← Protected dashboard pages
│   ├── auth/            ← Login/register pages
│   ├── page.tsx         ← Landing page
│   └── layout.tsx       ← Root layout
├── components/          ← Reusable React components
├── public/              ← Static assets (images, fonts)
├── package.json
├── tsconfig.json
├── next.config.ts
└── Dockerfile           ← Frontend build image
```

**What NOT to edit here:**
- No API logic (that's in `services/api/`)
- No Python code
- No database queries (those are in `services/api/`)

---

### `services/api/`
**Next.js REST API** — All backend endpoints and server-side logic.

```
services/api/
├── src/app/api/         ← REST endpoints
│   ├── documents/       ← GET/POST/DELETE documents
│   ├── query/           ← Execute AI queries
│   ├── chat/            ← Chat sessions
│   ├── auth/            ← Authentication
│   ├── equipment/       ← Equipment inventory
│   └── health/          ← Service health check
├── src/lib/             ← Utilities (server-side only)
│   ├── db/              ← Drizzle ORM queries
│   ├── auth/            ← JWT validation
│   ├── clients/         ← S3, Redis, Worker API calls
│   └── server/          ← HTTP helpers, rate limiting
├── middleware.ts        ← Auth routing
├── package.json
├── tsconfig.json
└── Dockerfile           ← API build image
```

**What lives here:**
- All REST endpoints (`/api/*`)
- Database queries (Drizzle ORM)
- Auth logic (JWT validation)
- Calls to external services

**What does NOT live here:**
- React components (that's frontend/)
- Python code (that's worker/)
- Database migrations (that's db/)

---

### `services/worker/`
**Python async processing** — Background jobs, OCR, embeddings, RAG, LLM.

```
services/worker/
├── app/
│   ├── main.py          ← FastAPI app
│   ├── celery_app.py    ← Task queue
│   ├── config.py        ← Settings & env vars
│   ├── routes/          ← FastAPI endpoints
│   ├── tasks/           ← Celery tasks (wrappers only)
│   │   ├── ingestion.py
│   │   └── query.py
│   └── services/        ← Business logic
│       ├── ingestion/   ← OCR, chunking, embeddings
│       ├── retrieval/   ← Search, vectordb, RAG, LLM
│       └── db.py        ← Database operations
├── tests/               ← Pytest tests
├── pyproject.toml
└── Dockerfile           ← Worker build image
```

**Clear boundary:**
- `services/worker/app/services/` = pure business logic (no external wrappers)
- `services/worker/app/tasks/` = Celery task wrappers only
- `services/worker/app/routes/` = FastAPI endpoint wrappers only

---

## DB/ — DATABASE MIGRATIONS

```
db/
└── migrations/
    ├── 001_initial_schema.sql       ← Tables, constraints
    ├── 002_hnsw_indexes.sql         ← Vector search indexes
    └── 003_chat_sessions.sql        ← Chat history tables
```

**Single source of truth** for database schema. Both Drizzle (`services/api/src/lib/db/schema.ts`) and the worker must match these.

---

## INFRA/ — DEPLOYMENT CONFIGS

```
infra/
├── docker-compose.yml       ← Development (all services)
└── docker-compose.dev.yml   ← Alias for above
```

**How to use:**
```bash
docker compose -f infra/docker-compose.yml up     # Local dev
docker compose -f infra/docker-compose.yml logs -f # Watch logs
```

---

## DOCS/ — DOCUMENTATION

```
docs/
├── STRUCTURE.md             ← This file (folder layout)
├── API.md                   ← REST API endpoints reference
├── DEPLOYMENT.md            ← How to deploy
└── DEVELOPMENT.md           ← Local setup guide
```

---

## HOW TO TRACK WHAT CLAUDE UPDATES

When Claude makes changes:

| Path | What changed | Why it matters |
|------|--------------|-----------------|
| `services/frontend/` | UI components, pages | Affects what users see |
| `services/api/src/app/api/` | REST endpoints | Affects what frontend calls |
| `services/api/src/lib/` | Database queries, auth | Affects backend logic |
| `services/worker/app/services/` | OCR, embeddings, RAG | Affects document processing |
| `services/worker/app/tasks/` | Background job wrappers | Affects job scheduling |
| `db/migrations/` | Database schema | Affects data structure |
| `docs/` | Documentation | Affects understanding |

---

## QUICK REFERENCE

**Start development:**
```bash
docker compose -f infra/docker-compose.yml up
```

**Where is the [thing]?**
- UI pages? → `services/frontend/src/app/`
- REST endpoint? → `services/api/src/app/api/`
- Database query? → `services/api/src/lib/db/`
- Document processing? → `services/worker/app/services/ingestion/`
- LLM calls? → `services/worker/app/services/retrieval/llm.py`
- Background jobs? → `services/worker/app/tasks/`
- Database schema? → `db/migrations/`
- Deployments? → `infra/docker-compose.yml`

---

## IMPORTANT

- **Don't edit old folders** (`nautos-app/`, `nautos-worker/`, `shared/`) — they're deprecated
- **Source of truth** is `services/` + `db/` + `infra/`
- **When the team grows**, this structure scales:
  - Separate CI/CD per service
  - Independent deployments
  - Clear team boundaries (frontend owns `services/frontend/`, backend owns `services/api/` + `services/worker/`)
