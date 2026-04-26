import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { NextResponse } from 'next/server'
import { checkRateLimit, checkEmailLimit, checkIPSpam } from '@/lib/rate-limit'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { sendPasswordResetEmail } from '@/lib/email'
import { auth } from '@/lib/auth-config'

export async function POST(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown'
  const { allowed } = checkRateLimit(`forgot-password:${ip}`, 3, 600000)
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { allowed: ipAllowed } = checkIPSpam(ip)
  if (!ipAllowed) {
    return NextResponse.json({ success: false, error: 'Too many requests from this network.' })
  }

  const { email, turnstileToken, source } = await request.json()

  // Verify dashboard source is actually authenticated
  let isDashboard = false
  if (source === 'dashboard') {
    const session = await auth()
    isDashboard = !!session?.user?.id
  }

  // Captcha only for public page (dashboard user is already authenticated)
  if (!isDashboard) {
    if (!turnstileToken) {
      return NextResponse.json({ success: false, error: 'Security verification required.' })
    }
    const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY!,
        response: turnstileToken,
      }),
    })
    const turnstileData = await turnstileRes.json()
    if (!turnstileData.success) {
      return NextResponse.json({ success: false, error: 'Security verification failed. Please try again.' })
    }
  }

  const { allowed: emailAllowed } = checkEmailLimit(email)
  if (!emailAllowed) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Please try again in 1 hour.' })
  }

  // Find user by email
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  // Always return success to prevent email enumeration
  if (!user) {
    return NextResponse.json({ success: true })
  }

  // Generate reset token and store it
  const token = crypto.randomUUID() + crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await db.insert(schema.passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  })

  // Send reset email
  try {
    await sendPasswordResetEmail(email, token)
  } catch (e) {
    console.error('[Password Reset] Email send failed:', e)
  }

  // Log forgot password request (fire-and-forget)
  logActivity({
    action: 'forgot_password',
    userId: user.id,
    email,
    ...getRequestInfo(request),
  }).catch(() => {})

  // Dashboard flow: logout ALL sessions
  if (isDashboard) {
    try {
      await db
        .delete(schema.userSessions)
        .where(eq(schema.userSessions.userId, user.id))
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ success: true })
}
