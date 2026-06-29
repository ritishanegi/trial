# NAUTOS Worker — Extraction Pipeline: Manual Testing Guide

> **Phase 4 feature**: Excel export via LLM-powered structured data extraction from maritime technical documents.

---

## Prerequisites

Ensure the full dev stack is running before any steps below:

```bash
make up          # starts PostgreSQL, Redis, Elasticsearch, the FastAPI worker, and Flower
```

Verify the worker API is reachable:

```bash
curl http://localhost:8000/health
# → {"status": "ok"}
```

---

## Step 1 — Ingest a Sample Maritime PDF

Use the existing ingestion API endpoint. Replace `YOUR_TENANT_ID` and the S3 key with real values.

```bash
# 1a. Upload the PDF to S3 (or use the app UI's "Upload Document" flow)
aws s3 cp your_document.pdf s3://nautos-documents/tenants/YOUR_TENANT_ID/your_document.pdf

# 1b. Trigger ingestion via the API
curl -X POST http://localhost:8000/documents/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "document_id": "YOUR_DOCUMENT_UUID",
    "s3_key": "tenants/YOUR_TENANT_ID/your_document.pdf",
    "tenant_id": "YOUR_TENANT_ID"
  }'
```

Wait for ingestion to complete. Poll the status endpoint:

```bash
curl http://localhost:8000/documents/YOUR_DOCUMENT_UUID/status
# → {"status": "complete", "progress": 100}
```

---

## Step 2 — Run the Extraction Service

Call the extraction endpoint, specifying what you want to extract in plain English:

```bash
curl -X POST http://localhost:8000/documents/extract-table \
  -H "Content-Type: application/json" \
  -d '{
    "document_id": "YOUR_DOCUMENT_UUID",
    "tenant_id": "YOUR_TENANT_ID",
    "description": "parts list with part number, designation, and quantity"
  }' \
  --output extracted_output.xlsx
```

You can also test directly from Python (useful in a running devcontainer):

```python
from app.services.extraction import ExtractionService

svc = ExtractionService()
xlsx_bytes, filename = svc.extract_to_excel(
    document_id="YOUR_DOCUMENT_UUID",
    tenant_id="YOUR_TENANT_ID",
    description="parts list with part number, designation, and quantity",
)
with open(filename, "wb") as f:
    f.write(xlsx_bytes)
print(f"Saved: {filename}")
```

---

## Step 3 — Validate the Output

Open `extracted_output.xlsx` and compare every row against the source PDF:

| Check | Pass Condition |
|---|---|
| **Column headers present** | All expected fields appear as column headers in row 1 |
| **Row count matches** | Number of data rows equals the number of entries in the source |
| **Values are verbatim** | Part numbers, codes, serial numbers are character-for-character exact |
| **No hallucinated rows** | No rows exist that have no counterpart in the source PDF |
| **No hallucinated columns** | No columns contain data that isn't in the source |
| **Null/empty cells** | Empty cells in source are `null`/blank in xlsx, not fabricated values |
| **Multilingual handling** | For German/English/French docs, designation fields include all languages separated by ` / ` |

---

## Step 4 — Record Accuracy

Fill in this table after each test run and commit to `docs/extraction_accuracy_log.md`:

```markdown
| Date | Document | Description Used | Correct / Total Fields | Hallucinated | Missing | Notes |
|------|----------|------------------|------------------------|--------------|---------|-------|
| YYYY-MM-DD | [doc name] | "parts list..." | XX / YY | N | N | |
```

**Definitions:**
- **Correct**: Field value matches source PDF exactly (or within acceptable rounding for numeric values)
- **Hallucinated**: A field value appears in the xlsx that does not exist in the source
- **Missing**: A field that exists in the source is absent or blank in the xlsx

---

## Step 5 — Repeat with Multiple Document Types

Test with at least 3 different maritime document types to detect schema drift:

### Recommended Test Matrix

| Document Type | Example Description to Use | Key Fields to Verify |
|---|---|---|
| **Spare parts catalog** (e.g. MAN, Wärtsilä) | `"spare parts list with item number, drawing ref, designation, quantity"` | Item no., quantity, drawing reference |
| **Safety certificate** (e.g. SOLAS, ISM) | `"certificates with certificate type, issue date, expiry date, issuing authority"` | Dates in correct format, authority names |
| **Engine inspection report** | `"inspection findings with component name, finding, action required, target date"` | Component names, action items |
| **Bunker report / delivery note** | `"fuel delivery details with fuel type, quantity, density, supplier, port"` | Numeric quantities, units |
| **Maintenance record** | `"maintenance tasks with task description, interval, last performed date, next due date"` | Date formats, intervals |

### What to Watch For

- **Context window overflow**: Very long documents (>100 pages) may hit the LLM's token limit. If you see truncated rows, note it in the accuracy log and raise as an open design decision.
- **Schema instability across runs**: Run the same document twice and check if the extracted column names are consistent. Inconsistent snake_case key generation indicates the LLM is not being deterministic enough.
- **Non-tabular documents**: Documents without clear tabular data (e.g. narrative reports) may return too many rows or incorrect structure. Note the document type and expected behaviour.

---

## Troubleshooting

### "Document has no indexed content yet."
The ingestion pipeline hasn't completed, or it failed silently. Check:
```bash
curl http://localhost:8000/documents/YOUR_DOCUMENT_UUID/status
# Check Celery Flower at http://localhost:5555 for task failures
```

### "The LLM did not return valid JSON"
The extraction description may be too vague. Try a more structured prompt:
```
"Extract a table of spare parts. Each row must have: part_no (string), designation (string), quantity (integer)."
```

### LLM Rate Limit Errors
The service has automatic fallback across providers (Groq → Gemini → Anthropic). If all fail, wait 60 seconds and retry. Check `.env` for valid API keys.

### Truncated Output (Fewer Rows Than Expected)
Large documents that exceed the LLM's context window will produce partial extractions.
**Open design decision**: Implement chunk-batched extraction with row merging, or use a summarize-then-extract approach. Flag this in `docs/extraction_accuracy_log.md` and raise with the team.
