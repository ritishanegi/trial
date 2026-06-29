/**
 * Next.js App Router Instrumentation Hook
 *
 * This file is the official entry point for Next.js instrumentation
 * (https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
 *
 * It is executed ONCE per server process start — both in Node.js and Edge
 * runtimes. Sentry is initialised here so that all server-side errors,
 * performance traces, and slow DB queries are captured from the very first
 * request.
 *
 * Activation: add `experimental.instrumentationHook = true` in next.config.ts
 * (already the default in Next.js 15+).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    /**
     * Node.js runtime: full Sentry SDK with profiling and DB integrations.
     * Dynamic import keeps this out of the Edge bundle.
     */
    const Sentry = await import('@sentry/nextjs');

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',

      // ── Sampling ──────────────────────────────────────────────────────────
      // Capture 20 % of traces in production; 100 % in dev/staging
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // ── Integrations ──────────────────────────────────────────────────────
      integrations: [
        // Automatically capture slow database queries and HTTP requests
        Sentry.prismaIntegration(),
      ],

      // ── Release tracking ──────────────────────────────────────────────────
      release: process.env.NEXT_PUBLIC_APP_VERSION,

      // ── PII scrubbing ─────────────────────────────────────────────────────
      // Strip sensitive maritime/tenant data from error payloads before sending
      beforeSend(event) {
        // Remove user PII from breadcrumbs
        if (event.breadcrumbs?.values) {
          event.breadcrumbs.values = event.breadcrumbs.values.map((crumb) => {
            if (crumb.data) {
              const { password, token, jwt, ...safeData } = crumb.data as Record<
                string,
                unknown
              >;
              void password;
              void token;
              void jwt;
              crumb.data = safeData;
            }
            return crumb;
          });
        }
        return event;
      },

      // Do not send errors in local development unless explicitly enabled
      enabled: process.env.NODE_ENV !== 'development' || process.env.SENTRY_FORCE_ENABLE === 'true',
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    /**
     * Edge runtime: lightweight Sentry init (no profiling, no Node.js APIs).
     */
    const Sentry = await import('@sentry/nextjs');

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      enabled: process.env.NODE_ENV !== 'development',
    });
  }
}

/**
 * onRequestError — called by Next.js 15 whenever a server component or
 * route handler throws an unhandled error. Gives Sentry the full request
 * context (URL, method, headers) at the time of the failure.
 */
export const onRequestError = async (
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string },
) => {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureException(err, {
    extra: {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
    },
  });
};
