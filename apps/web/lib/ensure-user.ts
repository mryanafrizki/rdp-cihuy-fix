/**
 * No-op: Auth.js creates users at signup via the /api/auth/register route.
 * This file is kept for backward compatibility but does nothing.
 */
export async function ensureUser(_client: unknown, _userId: string, _email: string): Promise<boolean> {
  return true
}
