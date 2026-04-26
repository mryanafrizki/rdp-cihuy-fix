/**
 * Verify a Cloudflare Turnstile token server-side.
 * Returns true if valid, false otherwise.
 */
export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // Skip verification if not configured (dev mode)

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    })
    const data = await res.json()
    return data.success === true
  } catch {
    return false
  }
}
