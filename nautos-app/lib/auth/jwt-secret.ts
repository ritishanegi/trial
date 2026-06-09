/**
 * Retrieves the JWT secret from environment variables.
 * Throws an error if the secret is not defined to prevent runtime issues.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error('JWT_SECRET is not defined in the environment variables.');
  }
  return secret;
}
