/**
 * Sentry Server-Side Configuration (Node.js runtime)
 *
 * Handles errors from:
 * - Next.js API route handlers
 * - Server Components (via instrumentation.ts onRequestError)
 * - Server Actions
 *
 * This file is automatically injected by the @sentry/nextjs Webpack plugin.
 *
 * Required environment variables:
 *   SENTRY_DSN=https://xxx@o0.ingest.sentry.io/yyy
 *   SENTRY_ORG=your-org-slug            (for source map upload)
 *   SENTRY_PROJECT=nautos-app           (for source map upload)
 *   SENTRY_AUTH_TOKEN=sntrys_xxx        (for source map upload, keep secret!)
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',

  // ── Sampling ──────────────────────────────────────────────────────────────
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // ── Integrations ──────────────────────────────────────────────────────────
  integrations: [
    // Captures continuous server profiling snapshots (requires @sentry/profiling-node)
    Sentry.nodeProfilingIntegration(),
  ],

  // ── Release ───────────────────────────────────────────────────────────────
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // ── PII scrubbing ─────────────────────────────────────────────────────────
  beforeSend(event) {
    // Redact Authorization headers from request data
    if (event.request?.headers) {
      const headers = event.request.headers as Record<string, string>;
      if (headers['authorization']) {
        headers['authorization'] = '[Redacted]';
      }
      if (headers['cookie']) {
        headers['cookie'] = '[Redacted]';
      }
    }
    return event;
  },

  // Ignore well-known non-actionable errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    /^Network request failed$/,
    /^Failed to fetch$/,
  ],

  enabled: process.env.NODE_ENV !== 'development' || process.env.SENTRY_FORCE_ENABLE === 'true',
});
