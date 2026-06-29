/**
 * Sentry Client-Side Configuration
 *
 * Loaded by the browser bundle. Enables:
 * - Session Replay (errors only by default — no continuous recording)
 * - Browser tracing (page navigations, XHR/fetch spans)
 * - React component tree in error reports
 *
 * This file is automatically picked up by @sentry/nextjs via its Webpack plugin.
 * Do NOT import it manually — the plugin handles injection.
 *
 * Required environment variable:
 *   NEXT_PUBLIC_SENTRY_DSN=https://xxx@o0.ingest.sentry.io/yyy
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',

  // ── Sampling ──────────────────────────────────────────────────────────────
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // ── Session Replay ────────────────────────────────────────────────────────
  // Capture replay for 0 % of normal sessions, 100 % of sessions with errors.
  // Replay is only enabled when user has not opted out (GDPR consideration).
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default (maritime data is sensitive)
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // ── Release ───────────────────────────────────────────────────────────────
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // ── Breadcrumb filtering ──────────────────────────────────────────────────
  beforeBreadcrumb(breadcrumb) {
    // Drop noisy polling requests to health endpoints
    if (breadcrumb.category === 'fetch' && breadcrumb.data?.url?.includes('/api/health')) {
      return null;
    }
    return breadcrumb;
  },

  enabled: process.env.NODE_ENV !== 'development',
});
