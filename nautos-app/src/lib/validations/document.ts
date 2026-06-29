import { z } from 'zod';

/**
 * Document API Validation Schemas
 *
 * Mirrors the Python worker's Pydantic models in:
 *   nautos-worker/app/models/schemas.py
 */

// ── IngestionRequest ──────────────────────────────────────────────────────────
// Mirrors: class IngestionRequest(BaseModel) in schemas.py

export const IngestionRequestPayloadSchema = z.object({
  /** UUID of the document record in the database */
  document_id: z.string().uuid('document_id must be a valid UUID'),

  /** The S3 object key where the uploaded PDF is stored */
  s3_key: z
    .string()
    .min(1, 's3_key cannot be empty')
    .regex(/^[a-zA-Z0-9!_.*'()\-/]+$/, 'Invalid S3 key format'),

  /** Tenant identifier — used to scope the ingestion job */
  tenant_id: z.string().uuid('tenant_id must be a valid UUID'),
});

export type IngestionRequestPayload = z.infer<typeof IngestionRequestPayloadSchema>;

// ── PromotionRequest ──────────────────────────────────────────────────────────
// Mirrors: class PromotionRequest(BaseModel) in schemas.py

export const PromotionRequestPayloadSchema = z.object({
  /** UUID of the document to promote to master library */
  document_id: z.string().uuid('document_id must be a valid UUID'),

  /** User ID of the approver (for audit trail) */
  approved_by: z.string().min(1, 'approved_by cannot be empty'),
});

export type PromotionRequestPayload = z.infer<typeof PromotionRequestPayloadSchema>;

// ── IngestionJobStatus ────────────────────────────────────────────────────────
// Frontend representation of a job status response

export const IngestionJobStatusSchema = z.object({
  document_id: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'complete', 'failed']),
  progress: z.number().int().min(0).max(100),
  total_pages: z.number().int().nullable(),
  processed_pages: z.number().int(),
  error: z.string().nullable(),
});

export type IngestionJobStatus = z.infer<typeof IngestionJobStatusSchema>;
