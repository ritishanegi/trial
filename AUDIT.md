# NAUTOS AI — Production Logic Audit

Findings from systematic review of multi-tenancy, error handling, data integrity,
external API failure modes, security, and resource limits.

Severity ratings:
- **🔴 Critical** — silent data loss, security risk, or definitely-will-break-in-prod
- **🟡 High** — degrades reliability or UX under realistic load
- **🟢 Medium** — quality-of-life, edge cases, future scaling concerns

---

## 🔴 Critical findings

### C1. Ingestion re-runs duplicate embeddings (we already see orphans)

**File:** `nautos-worker/app/tasks/ingestion.py`

If ingestion fails partway (e.g. embeddings stored but Elasticsearch index fails), the Celery retry runs the whole pipeline again. The new run inserts NEW embeddings rather than checking for or replacing existing ones. After 3 retries, the document has 3× chunks in pgvector.

**Evidence:** We saw 33 embeddings across 4 documents — but ES only has 6 chunks for those same docs. That's the symptom: pgvector got the old ingestion attempts, ES didn't.

**Fix:**
```python
# At start of ingestion, delete any prior chunks for this document
vectordb.delete_chunks_for_document(document_id, tenant_id)
search.delete_chunks_for_document(document_id)
```
Or make the inserts idempotent with `ON CONFLICT (document_id, chunk_index) DO UPDATE`.

---

### C2. Vessel ID accepted from client without tenant ownership check

**File:** `nautos-app/src/app/api/documents/upload/route.ts` (and equipment route)

The upload route accepts `vesselId` from the request body and inserts it into the document row — but never verifies the vessel belongs to the user's tenant.

**Impact:** A malicious tenant could associate their documents with another tenant's vessel ID. The document still has their `tenant_id`, so cross-tenant data leak via query is prevented, but the foreign key now points across tenants, and listing "documents for vessel X" from the other tenant's UI could surface unexpected results. Also breaks foreign-key invariants conceptually.

**Fix:** Before insert, verify:
```ts
if (vesselId) {
  const [v] = await db.select({id: vessels.id})
    .from(vessels)
    .where(and(eq(vessels.id, vesselId), eq(vessels.tenantId, ctx.tenantId)))
    .limit(1);
  if (!v) return NextResponse.json({error: "Vessel not found"}, {status: 404});
}
```

Same check needed in `equipment/route.ts` POST.

---

### C3. Multi-step writes have no transaction (orphan risk)

**Files:** upload route, query route, chat sessions create

The upload flow does:
1. S3 PUT
2. `INSERT documents`
3. `INSERT ingestion_jobs`
4. `POST /tasks/ingest` to worker

If any step after S3 PUT fails, you have orphaned S3 objects. If `INSERT ingestion_jobs` fails, you have a document with no job — the UI shows "Pending" forever.

The query route does:
1. SELECT session
2. SELECT messages (history)
3. INSERT user message
4. UPDATE session (title/updated_at)
5. Stream from worker
6. INSERT assistant message (in wrapped stream)

If anything between steps 3 and 6 throws, the user message is in the DB without an assistant response. On reload, the chat shows half a conversation.

**Fix:** Wrap related writes in `db.transaction(async (tx) => ...)`. For S3 + DB, use a "pending" status and a periodic janitor task to clean up orphans older than 1 hour.

---

### C4. Chat history fetch has no LIMIT

**File:** `nautos-app/src/app/api/query/route.ts:57-61`

```ts
const prior = await db
  .select(...)
  .from(chatMessages)
  .where(eq(chatMessages.sessionId, sessionId))
  .orderBy(asc(chatMessages.createdAt));   // ← no .limit()
```

The worker truncates to last 10 turns (`MAX_HISTORY_TURNS`), but the DB query and HTTP transfer to the worker pulls everything. A 500-message session sends 500 messages over the wire just to discard 490 of them.

**Fix:** Add `.limit(MAX_HISTORY_TURNS * 2)` and `.orderBy(desc(...))`, then reverse on the client side. Or compute the relevant slice in SQL with `OFFSET (count - 20)`.

---

## 🟡 High findings

### H1. Documents list endpoint has no LIMIT or pagination

**File:** `nautos-app/src/app/api/documents/route.ts`

A tenant with 10K documents pulls all 10K on every page load. The frontend has a `<Table>` with no virtualization, so the browser will lock up rendering it.

**Fix:** Add `.limit(50)` plus an offset/cursor parameter, and skeleton pagination in the UI.

---

### H2. Elasticsearch `index_chunks` doesn't dedupe either

**File:** `nautos-worker/app/services/retrieval/search.py:46-63`

Same issue as C1 but on the ES side. Re-ingestion appends. Each chunk should have a deterministic `_id` (e.g. `f"{document_id}:{chunk_index}"`) so the bulk index uses upsert semantics.

**Fix:**
```python
actions.append({"index": {
  "_index": self.INDEX_NAME,
  "_id": f"{document_id}:{chunk['chunk_index']}"
}})
```

---

### H3. Ingestion task retries forever-ish on permanent errors

**File:** `nautos-worker/app/tasks/ingestion.py:96-99`

```python
except Exception as exc:
    update_job_status(document_id, "failed", error=str(exc))
    raise self.retry(exc=exc, countdown=60)
```

This retries on EVERY exception — including permanent ones like "S3 key not found" or "Azure DI quota exceeded for the day". With `max_retries=3` we burn 3 retries × 60s each on errors that will never succeed. Worse, it sets status to "failed" and then immediately changes it to "processing" on retry, causing UI flicker.

**Fix:** Catch known-transient exceptions (network errors, rate limits) and retry those. For permanent errors (404 from S3, invalid PDF), fail immediately without retry. Use exponential backoff.

---

### H4. Groq TPM cap will hit users in production

**File:** `nautos-worker/app/services/retrieval/llm.py`

Groq's free tier is 12K tokens-per-minute for `llama-3.3-70b-versatile`. Our requests are `input + max_tokens`. For a 5-page doc, we already use ~5K input + 4K max_tokens = 9K per request. Two concurrent users blow the cap.

We saw this exact failure during testing.

**Fix options:**
1. Pay Groq for higher tier ($10/mo gets you 100x the cap)
2. Add automatic provider fallback: catch the 429, retry on Gemini or Anthropic
3. Switch primary to Gemini 1.5 Flash (1M TPM free)

The worker's friendly_error_message handles the surfacing, but production users shouldn't see the error at all.

---

### H5. Errors swallowed silently in 4 places

| File | Line | What |
|------|------|------|
| `lib/auth/session.ts` | inside `verifyToken` | Returns null on any JWT error — fine for auth but hides config issues |
| `vectordb.py` | master library try/except | Hides DB errors as "empty master library" |
| `chat-interface.tsx` | sessions fetch | Catches network errors silently |
| `sessions-sidebar.tsx` | loadSessions | Catches network errors silently |

The frontend ones cause confusing UX (sessions never load and user has no idea why). The vectordb one could mask real bugs.

**Fix:** Log to console.error at minimum; ideally surface a toast to the user.

---

### H6. No automatic LLM provider fallback

When Groq is down or rate-limited, the request fails. We have `LLMService` factory but no try-on-primary-fall-back-to-secondary.

**Fix:** Wrap each provider call in try/except. On 429/5xx, transparently retry with the next configured provider. Keep a circuit breaker so we don't hammer a dead provider.

---

### H7. JWT default secret is checkable from source

**File:** `nautos-app/src/middleware.ts:9` and `lib/auth/index.ts`

```ts
const JWT_SECRET = new TextEncoder().encode(
  rawSecret || "dev-jwt-secret-change-in-production-64-characters-long-string!!"
);
```

The dev-default is in source. If someone deploys to prod without setting `JWT_SECRET`, an attacker who knows the source code can mint valid JWTs for any user. The production check exists (`throw if !rawSecret && NODE_ENV === "production"`) but a single misconfigured env var defeats it.

**Fix:** Throw unconditionally if the secret is the known dev string OR shorter than 32 chars, regardless of NODE_ENV.

---

## 🟢 Medium findings

### M1. File upload doesn't validate content type, only extension

`.pdf` extension check is trivially bypassed. Azure DI will fail on non-PDF, but the file is in S3 first. Could be used to upload arbitrary content as "documents". Validate magic bytes (PDF starts with `%PDF-`).

### M2. `docType` and `scope` aren't validated against enums

The upload route accepts any string for `docType`. Add a Zod enum check matching `DOC_TYPES` from `lib/constants.ts`.

### M3. No connection pool size monitoring

Postgres pool: max 10 (app), max 10 (worker). Two services × 10 = 20 connections used. Postgres default is 100. Fine for one tenant, will need bumping as users grow.

### M4. Analytics queries scan whole tables

`docsByStatus` and `dailyQueries` group across the entire `query_log` and `documents` tables. No date constraint on `docsByStatus`. At 1M queries this is several seconds per dashboard load.

**Fix:** Use materialized views or partial indexes, or limit to last N days.

### M5. No structured logging

Worker uses `logger.info(f"...")` plain strings. Hard to grep for tenant_id or document_id when debugging at scale. Switch to JSON logging with consistent fields.

### M6. No Sentry / error tracking

Errors only go to docker logs. Once you deploy, you'll be blind to user-facing errors. Add Sentry to both Next.js and the Python worker.

### M7. Failed documents pile up forever

We saw 3 "Failed" MAIN AIR COMPRESSOR docs from earlier tests. No way for the user to delete them from the UI. No auto-cleanup of files in S3 for failed ingests.

### M8. SSE stream wrapping risks if client disconnects

`wrapStreamForPersistence` in `/api/query/route.ts` reads the upstream worker SSE in a `start()` callback. If the client disconnects mid-stream, the worker keeps streaming and we keep reading until done — then save a partial-but-saved assistant message. Should detect disconnect and cancel the upstream.

### M9. CSRF protection relies entirely on SameSite=lax cookies

OK for now, but if you ever do cross-origin embedding (white-label widgets on customer sites), this breaks. Consider adding double-submit token for mutation routes.

### M10. No content-length limit on JSON body parsing

Next.js default body parser accepts huge JSON. A 100MB JSON to `/api/query` would OOM the Node server. Add explicit body size limits.

---

## What to fix BEFORE first paying customer

In rough order:

1. **C2** — Vessel ID tenant ownership check (security)
2. **C1 + H2** — Idempotent ingestion (data integrity, we're already seeing the symptom)
3. **C4 + H1** — Add LIMITs to unbounded queries (scaling)
4. **H7** — Lock down JWT default (security)
5. **H4 + H6** — LLM provider fallback chain (reliability)
6. **C3** — Wrap multi-step writes in transactions (data integrity)
7. **M6** — Add Sentry (observability — you'll need it day 1)
8. **H3** — Smarter retry policy for ingestion

The rest are "second month" items.

---

## What you're doing right (worth keeping)

- Every API route has `requireTenant` ✓
- Every worker DB query filters by tenant_id ✓
- SQL is parameterized (one safe f-string, otherwise all `%s`) ✓
- LLM is properly abstracted (swap providers in one env var) ✓
- Rate limiting on auth + upload ✓
- Cookies are httpOnly + SameSite=lax ✓
- Passwords hashed with bcrypt cost 12 ✓
- File upload size limit enforced ✓
- The architecture is clean and the code is readable ✓
