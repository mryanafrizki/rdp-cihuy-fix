/**
 * Cobain Gateway Worker
 *
 * Cloudflare Worker — API gateway for:
 * 1. DigitalOcean API proxy (hides VPS IP behind Cloudflare edge)
 * 2. Saweria PG payment proxy (create QRIS, check status)
 * 3. Saweria webhook receiver (verify HMAC, forward to cobain-web)
 *
 * Deploy: wrangler deploy
 */

export interface Env {
  SAWERIA_PG_URL: string
  SAWERIA_API_KEY: string
  SAWERIA_WEBHOOK_SECRET: string
  GATEWAY_SECRET: string
  COBAIN_WEB_URL: string
  ENVIRONMENT: string
}

// --- Scramble data for Saweria (required: unique name/email/message per request) ---

const NAMES = [
  'Rizki','Dewi','Andi','Sari','Budi','Putri','Fajar','Nisa','Dimas','Ayu',
  'Raka','Lina','Yoga','Mega','Bayu','Rina','Arif','Wulan','Dani','Tika',
  'Hendra','Sinta','Galih','Indah','Eko','Ratna','Agus','Fitri','Joko','Yuni',
  'Wahyu','Dina','Rendi','Citra','Ilham','Novi','Surya','Lia','Adi','Rini',
]

const DOMAINS = [
  'gmail.com','yahoo.com','outlook.com','hotmail.com','yahoo.co.id',
  'protonmail.com','icloud.com','mail.com','zoho.com','yandex.com',
]

const MESSAGES = [
  'Semangat terus kak!','Sukses selalu ya','Mantap kontennya',
  'Lanjutkan kak','Keren bgt dah','Gas terus kak!',
  'Terus berkarya ya!','Keren kak','Lanjut terus!','Mantap bgt!',
  'Sukses terus ya','Bagus bgt kak','Salut kak!','Semangat ya kak',
  'Gaskeun kak!','Kontennya bagus bgt','Makin keren aja',
  'Jangan nyerah ya!','Inspiratif bgt','Keep it up!',
]

const EMOJIS = ['', '', ' \u{1F525}', ' \u{1F4AA}', ' \u{1F389}', ' \u{1F44D}', ' \u{2728}', ' \u{1F4AF}']

function randomItem<T>(arr: T[]): T {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return arr[buf[0] % arr.length]
}

function randomDigits(min = 3, max = 5): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const len = min + (buf[0] % (max - min + 1))
  const digits = new Uint8Array(len)
  crypto.getRandomValues(digits)
  return Array.from(digits, d => (d % 10).toString()).join('')
}

function scrambleName(name: string): string {
  const chars = name.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const j = buf[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  const result = chars.join('')
  return result.charAt(0).toUpperCase() + result.slice(1).toLowerCase()
}

function generateDonatur() {
  const baseName = randomItem(NAMES)
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const name = buf[0] % 2 === 0 ? scrambleName(baseName) : baseName
  const domain = randomItem(DOMAINS)
  const email = `${name.toLowerCase()}${randomDigits()}@${domain}`
  const message = randomItem(MESSAGES) + randomItem(EMOJIS)
  return { name, email, message: message.trim() }
}

// --- Routing ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }))
    }

    try {
      if (path === '/' || path === '/health') {
        return corsResponse(json({ status: 'ok', service: 'cobain-gateway', ts: Date.now() }))
      }

      if (path.startsWith('/do/')) {
        return corsResponse(await handleDoProxy(request, path, env))
      }

      if (path.startsWith('/payment/')) {
        return corsResponse(await handlePayment(request, path, env))
      }

      if (path === '/webhook/saweria') {
        return corsResponse(await handleSaweriaWebhook(request, env))
      }

      return corsResponse(json({ error: 'Not found' }, 404))
    } catch (e: any) {
      console.error('Worker error:', e)
      return corsResponse(json({ error: e.message || 'Internal error' }, 500))
    }
  },
}

// --- Auth ---

function verifyGatewaySecret(request: Request, env: Env): boolean {
  const secret = request.headers.get('x-gateway-secret')
  return secret === env.GATEWAY_SECRET
}

// --- DigitalOcean API Proxy (unchanged) ---

async function handleDoProxy(request: Request, path: string, env: Env): Promise<Response> {
  if (!verifyGatewaySecret(request, env)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const doToken = request.headers.get('x-do-token')
  if (!doToken) {
    return json({ error: 'Missing x-do-token header' }, 400)
  }

  const doPath = path.replace(/^\/do/, '')
  const doUrl = `https://api.digitalocean.com/v2${doPath}`
  const url = new URL(request.url)
  const fullUrl = url.search ? `${doUrl}${url.search}` : doUrl

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${doToken}`,
    'Content-Type': 'application/json',
  }

  const init: RequestInit = { method: request.method, headers }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const body = await request.text()
    if (body) init.body = body
  }

  const doResponse = await fetch(fullUrl, init)
  const responseBody = await doResponse.text()
  return new Response(responseBody, {
    status: doResponse.status,
    headers: { 'Content-Type': doResponse.headers.get('Content-Type') || 'application/json' },
  })
}

// --- Saweria Payment Proxy ---

async function handlePayment(request: Request, path: string, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  if (!verifyGatewaySecret(request, env)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const body = await request.json() as Record<string, string>

  if (path === '/payment/create') {
    const donatur = generateDonatur()
    const amount = Number(body.nominal || body.amount || 0)

    if (amount < 1000) {
      return json({ status: false, message: 'Minimum amount is 1000' }, 400)
    }

    const saweriaRes = await fetch(`${env.SAWERIA_PG_URL}/api/v1/payment`, {
      method: 'POST',
      headers: {
        'X-API-Key': env.SAWERIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        message: donatur.message,
        customer_name: donatur.name,
        customer_email: donatur.email,
        reference_id: body.reff_id || '',
      }),
    })

    const saweriaData = await saweriaRes.json() as {
      success: boolean
      message?: string
      data?: {
        transaction_id: string
        qr_string: string
        amount: number
        status: string
        created_at: string
      }
    }

    if (!saweriaData.success || !saweriaData.data) {
      return json({
        status: false,
        message: saweriaData.message || 'Payment creation failed',
      }, saweriaRes.status >= 400 ? saweriaRes.status : 502)
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    return json({
      status: true,
      data: {
        id: saweriaData.data.transaction_id,
        qr_string: saweriaData.data.qr_string,
        nominal: saweriaData.data.amount,
        expired_at: expiresAt,
        status: saweriaData.data.status,
      },
    })
  }

  if (path === '/payment/status') {
    const paymentId = body.id
    if (!paymentId) {
      return json({ status: false, message: 'id required' }, 400)
    }

    const saweriaRes = await fetch(`${env.SAWERIA_PG_URL}/api/v1/payment/${paymentId}`, {
      headers: { 'X-API-Key': env.SAWERIA_API_KEY },
    })

    const saweriaData = await saweriaRes.json() as {
      success: boolean
      data?: {
        transaction_id: string
        amount: number
        status: string
        paid_at?: string
      }
    }

    if (!saweriaData.success || !saweriaData.data) {
      return json({ status: false, message: 'Status check failed' }, 502)
    }

    return json({
      status: true,
      data: {
        id: saweriaData.data.transaction_id,
        status: saweriaData.data.status,
        nominal: saweriaData.data.amount,
        paid_at: saweriaData.data.paid_at || null,
      },
    })
  }

  if (path === '/payment/cancel') {
    return json({ status: true, message: 'Payment will expire automatically (~15 min)' })
  }

  return json({ error: 'Unknown payment endpoint' }, 404)
}

// --- Saweria Webhook Receiver ---

async function handleSaweriaWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const rawBody = await request.text()

  const signature = request.headers.get('x-webhook-signature')
  if (env.SAWERIA_WEBHOOK_SECRET && signature) {
    const expected = await hmacSha256(rawBody, env.SAWERIA_WEBHOOK_SECRET)
    if (signature !== expected) {
      console.error('Webhook signature mismatch:', { received: signature, expected })
      return json({ error: 'Invalid signature' }, 403)
    }
  }

  const payload = JSON.parse(rawBody)
  console.log('Saweria webhook received:', JSON.stringify(payload))

  const cobainWebUrl = env.COBAIN_WEB_URL || 'https://rdp.cobain.dev'

  try {
    const forwardRes = await fetch(`${cobainWebUrl}/api/topup/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-secret': env.GATEWAY_SECRET,
        'x-webhook-source': 'saweria',
      },
      body: JSON.stringify(payload),
    })

    console.log(`Webhook forwarded to cobain-web: ${forwardRes.status}`)
    return json({ status: 'ok', routed: true, forward_status: forwardRes.status })
  } catch (e: any) {
    console.error('Webhook forward failed:', e.message)
    return json({ status: 'ok', routed: false, error: e.message })
  }
}

// --- Utilities ---

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('')
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gateway-secret, x-do-token')
  return new Response(response.body, { status: response.status, headers })
}
