/**
 * Loads and validates the JWT signing secret.
 *
 * Why this is in its own file: middleware.ts (runs in Edge runtime) and
 * lib/auth/index.ts (runs in Node runtime) both need the secret. Centralizing
 * the validation here means there's exactly one place to update the rules
 * and zero risk of one runtime accepting a weak secret while the other doesn't.
 *
 * Rules (production AND development — no escape hatch):
 *   1. JWT_SECRET env var must be set
 *   2. Must be at least 32 characters
 *   3. Must not match any known dev-default strings (which appear in source code
 *      and git history, so attackers can find them)
 *
 * If you're seeing the throw locally: generate a real secret and put it in .env:
 *   openssl rand -hex 32   (Linux/Mac)
 *   [Convert]::ToHexString((1..32 | %{Get-Random -Max 256}))   (PowerShell)
 */

const KNOWN_INSECURE_DEFAULTS = new Set([
  "dev-jwt-secret-change-in-production-64-characters-long-string!!",
  "your-secret-key",
  "secret",
  "changeme",
  "default",
  "test",
]);

const MIN_SECRET_LENGTH = 32;

let cachedEncodedSecret: Uint8Array | null = null;

export function getJwtSecret(): Uint8Array {
  if (cachedEncodedSecret) return cachedEncodedSecret;

  const raw = process.env.JWT_SECRET;

  if (!raw) {
    throw new Error(
      "JWT_SECRET environment variable is not set. " +
      "Generate one with `openssl rand -hex 32` and add it to .env"
    );
  }

  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long (got ${raw.length})`
    );
  }

  if (KNOWN_INSECURE_DEFAULTS.has(raw)) {
    throw new Error(
      "JWT_SECRET is set to a known insecure default value. " +
      "These appear in source code / docs and must never be used. " +
      "Generate a real secret with `openssl rand -hex 32`."
    );
  }

  cachedEncodedSecret = new TextEncoder().encode(raw);
  return cachedEncodedSecret;
}
