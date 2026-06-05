# LOCAL DEVELOPMENT SETUP

Get the project running locally.

---

## Prerequisites

- **Docker & Docker Compose** installed
- **Node.js 22+** (optional, for local TypeScript checks)
- **Python 3.12** (optional, for local tests)

---

## Start Development

```bash
# From repo root
docker compose -f infra/docker-compose.yml up -d

# Watch logs
docker compose -f infra/docker-compose.yml logs -f app      # Next.js frontend + API
docker compose -f infra/docker-compose.yml logs -f worker-celery  # Background jobs

# Stop everything
docker compose -f infra/docker-compose.yml down
```

The app starts at **http://localhost:3000**

---

## Inside Containers

```bash
# TypeScript type check (in app container)
docker compose exec app npx tsc --noEmit

# Run tests
docker compose exec app npm test

# Database shell
docker compose exec postgres psql -U nautos_user -d nautos

# Python type check
docker compose exec worker-api mypy app/

# View Celery tasks
docker compose exec worker-celery celery -A app.celery_app inspect active
```

---

## Troubleshooting

**Port 3000 already in use?**
```bash
docker compose -f infra/docker-compose.yml down  # Stop containers
# Or change port in infra/docker-compose.yml: 3000:3000 → 3001:3000
```

**Database migration failed?**
```bash
# Reset database (deletes all data)
docker volume rm nautos_pgdata
docker compose -f infra/docker-compose.yml up postgres
```

**Node modules out of sync?**
```bash
# Inside app container:
docker compose exec app pnpm install
```

**Python dependencies out of sync?**
```bash
# Rebuild worker images:
docker compose build worker-api worker-celery
docker compose restart worker-api worker-celery
```

---

## File Structure

When working locally, remember:
- **Frontend code:** `services/frontend/src/`
- **API endpoints:** `services/api/src/app/api/`
- **Worker jobs:** `services/worker/app/`
- **Database schema:** `db/migrations/`

See `docs/STRUCTURE.md` for full layout.
