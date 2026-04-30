/**
 * Centralized DO API fetch — routes ALL requests through Cloudflare Worker.
 *
 * Before: cobain-web → api.digitalocean.com (exposes VPS IP)
 * After:  cobain-web → gate1.eov.my.id/do/* → api.digitalocean.com (Cloudflare IP)
 *
 * Proxy mode (manual/rotate) is no longer needed — Worker IS the proxy.
 * User's proxyMode setting is ignored; all requests go through Worker.
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://gate1.eov.my.id'
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || ''

export async function doFetch(
  userId: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${GATEWAY_URL}/do${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-gateway-secret': GATEWAY_SECRET,
    'x-do-token': token,
  }

  const init: RequestInit = { method, headers }
  if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    init.body = JSON.stringify(body)
  }

  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  })

  if (response.status === 204) return {}

  const data = await response.json()

  if (response.status >= 400) {
    const msg = (data as Record<string, string>)?.message || `Error ${response.status}`
    const err = new Error(msg)
    err.name = 'DOApiError'
    throw err
  }

  return data
}

/**
 * Check proxy connectivity — now just checks Worker health.
 * Kept for backward compatibility with proxy check UI.
 */
export async function checkProxyConnectivity(
  proxy: { protocol: string; host: string; port: number; username?: string | null; password?: string | null },
  doToken: string,
): Promise<{ status: 'active' | 'failed'; responseTime: number; error?: string }> {
  const start = Date.now()
  try {
    const res = await fetch(`${GATEWAY_URL}/health`, {
      signal: AbortSignal.timeout(10000),
    })
    const responseTime = Date.now() - start
    if (res.ok) {
      return { status: 'active', responseTime }
    }
    return { status: 'failed', responseTime, error: `HTTP ${res.status}` }
  } catch (e) {
    return { status: 'failed', responseTime: Date.now() - start, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
