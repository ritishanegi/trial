import { z } from 'zod';

/**
 * Chat API Validation Schemas
 *
 * These mirror the Python worker's Pydantic models in:
 *   nautos-worker/app/models/schemas.py
 *
 * Use these schemas to validate payloads BEFORE sending to the worker API,
 * ensuring type safety at the network boundary.
 */

// ── QueryRequest ─────────────────────────────────────────────────────────────
// Mirrors: class QueryRequest(BaseModel) in schemas.py

export const ChatQueryPayloadSchema = z.object({
  /** The user's question text */
  question: z.string().min(1, 'Question cannot be empty').max(4000, 'Question is too long'),

  /** Tenant identifier (from the authenticated session) */
  tenant_id: z.string().uuid('tenant_id must be a valid UUID'),

  /** Optional vessel scope — limits retrieval to this vessel's documents */
  vessel_id: z.string().uuid('vessel_id must be a valid UUID').nullable().optional(),

  /** Optional: scope the query to a single document (bypasses RRF) */
  document_id: z.string().uuid('document_id must be a valid UUID').nullable().optional(),

  /** Optional base64-encoded image for vision queries */
  image: z.string().optional(),

  /** Optional chat history for multi-turn conversations */
  chat_history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional(),
});

export type ChatQueryPayload = z.infer<typeof ChatQueryPayloadSchema>;

// ── StreamResponse token types ────────────────────────────────────────────────

export const StreamTokenSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({
    type: z.literal('sources'),
    content: z.array(
      z.object({
        document_id: z.string(),
        title: z.string(),
        page_number: z.number().nullable(),
        scope: z.enum(['vessel', 'fleet', 'master']),
      }),
    ),
  }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), content: z.string() }),
]);

export type StreamToken = z.infer<typeof StreamTokenSchema>;
