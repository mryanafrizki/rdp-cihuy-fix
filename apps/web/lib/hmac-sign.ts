import crypto from 'crypto'

/**
 * Sign a request payload with HMAC-SHA256 for inter-service communication.
 * Returns timestamp and signature headers to attach to the request.
 */
export function signRequest(body: string, apiKey: string): { timestamp: string; signature: string } {
  const timestamp = String(Date.now())
  const payload = timestamp + body
  const signature = crypto.createHmac('sha256', apiKey).update(payload).digest('hex')
  return { timestamp, signature }
}
