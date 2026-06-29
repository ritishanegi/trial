/**
 * Sentry Edge Runtime Configuration
 *
 * Handles errors from:
 * - Next.js Middleware (src/middleware.ts)
 * - Edge API routes
 * - Edge Server Components
 *
 * The Edge runtime is a lightweight V8 sandbox — it cannot use Node.js APIs
 * or native modules. This config therefore omits profiling and DB integrations.
 *
 * This file is automatically injected by the @sentry/nextjs Webpack plugin
 * for the Edge bundle.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',

  // Lower sample rate for edge — middleware runs on every request
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  // ── Release ───────────────────────────────────────────────────────────────
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // ── Breadcrumb filtering ──────────────────────────────────────────────────
  beforeBreadcrumb(breadcrumb) {
    // Suppress auth-related breadcrumbs to avoid leaking JWT details
    if (breadcrumb.message?.includes('jwt') || breadcrumb.message?.includes('token')) {
      return null;
    }
    return breadcrumb;
  },

  enabled: process.env.NODE_ENV !== 'development',
});
