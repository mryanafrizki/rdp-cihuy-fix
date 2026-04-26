import { headers } from 'next/headers'

function parseDevice(ua: string): string {
  if (!ua || ua === 'unknown') return 'Unknown Device'

  // Detect browser
  let browser = 'Unknown'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'

  // Detect OS
  let os = 'Unknown'
  if (/iPhone/i.test(ua)) os = 'iPhone'
  else if (/iPad/i.test(ua)) os = 'iPad'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Mac OS X/i.test(ua)) os = 'macOS'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Linux/i.test(ua)) os = 'Linux'
  else if (/CrOS/i.test(ua)) os = 'ChromeOS'

  if (browser === 'Unknown' && os === 'Unknown') return 'Unknown Device'
  return `${browser} on ${os}`
}

/** Extract IP, User-Agent, and device from an API route Request */
export function getRequestInfo(request: Request): {
  ip: string
  userAgent: string
  device: string
} {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const device = parseDevice(userAgent)
  return { ip, userAgent, device }
}

/** Extract IP, User-Agent, and device from a server action (uses next/headers) */
export async function getServerActionInfo(): Promise<{
  ip: string
  userAgent: string
  device: string
}> {
  const hdrs = await headers()
  const forwarded = hdrs.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  const userAgent = hdrs.get('user-agent') || 'unknown'
  const device = parseDevice(userAgent)
  return { ip, userAgent, device }
}
