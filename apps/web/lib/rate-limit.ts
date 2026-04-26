const ipSpamMap = new Map<string, { count: number, resetAt: number }>()

export function checkIPSpam(ip: string): { allowed: boolean, remaining: number } {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000 // 10 minutes
  const maxAttempts = 10

  const entry = ipSpamMap.get(ip)
  if (!entry || now > entry.resetAt) {
    ipSpamMap.set(ip, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }
  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0 }
  }
  entry.count++
  return { allowed: true, remaining: maxAttempts - entry.count }
}

const rateLimitMap = new Map<string, { count: number, resetAt: number }>()

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean, remaining: number, resetIn: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs }
  }
  
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now }
  }
  
  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now }
}

const emailLimitMap = new Map<string, { count: number, resetAt: number }>()

export function checkEmailLimit(email: string): { allowed: boolean, remaining: number } {
  const key = email.toLowerCase()
  const now = Date.now()
  const windowMs = 10 * 60 * 1000 // 10 minutes
  const maxEmails = 10

  const entry = emailLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    emailLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxEmails - 1 }
  }
  if (entry.count >= maxEmails) {
    return { allowed: false, remaining: 0 }
  }
  entry.count++
  return { allowed: true, remaining: maxEmails - entry.count }
}
