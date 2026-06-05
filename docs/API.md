# NAUTOS API ENDPOINTS

Quick reference for all REST endpoints.

---

## Authentication

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/register` | Create user account |
| GET | `/api/auth/me` | Get current user |

---

## Documents

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/documents` | List all documents |
| POST | `/api/documents/upload` | Upload PDF file |
| GET | `/api/documents/[id]` | Get document details |
| DELETE | `/api/documents/[id]` | Delete document |
| GET | `/api/documents/[id]/status` | Check processing status |
| POST | `/api/documents/[id]/extract-table` | Extract table from document |

---

## Queries (AI Chat)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/query` | Execute AI query against documents |
| GET | `/api/chat/sessions` | List chat sessions |
| POST | `/api/chat/sessions` | Create new session |
| GET | `/api/chat/sessions/[id]` | Get session messages |
| POST | `/api/chat/sessions/[id]` | Add message to session |

---

## Vessels & Equipment

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/vessels` | List vessels |
| POST | `/api/vessels` | Create vessel |
| GET | `/api/vessels/[id]` | Get vessel details |
| PUT | `/api/vessels/[id]` | Update vessel |
| GET | `/api/equipment` | List equipment inventory |

---

## Analytics

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/analytics` | Dashboard metrics |

---

## Health

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Service health check |

---

## File Locations

All endpoints are defined in:
```
services/api/src/app/api/[endpoint]/route.ts
```

For example:
- `/api/documents` → `services/api/src/app/api/documents/route.ts`
- `/api/query` → `services/api/src/app/api/query/route.ts`
- `/api/chat/sessions` → `services/api/src/app/api/chat/sessions/route.ts`
