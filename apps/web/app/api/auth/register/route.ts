import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { NextRequest, NextResponse } from 'next/server'
import { checkEmailLimit, checkIPSpam } from '@/lib/rate-limit'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyNewUser, notifyError } from '@/lib/telegram-notify'
import { sendEmailConfirmation } from '@/lib/email'

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  const { allowed: ipAllowed } = checkIPSpam(ip)
  if (!ipAllowed) {
    return NextResponse.json({
      success: false,
      error: 'Too many requests from this network. Please try again later.',
    })
  }

  const { email, password, turnstileToken } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ success: false, error: 'Email and password are required' })
  }

  // Verify Cloudflare Turnstile
  if (turnstileToken) {
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
  } else {
    return NextResponse.json({ success: false, error: 'Security verification required.' })
  }

  const { allowed: emailAllowed } = checkEmailLimit(email)
  if (!emailAllowed) {
    return NextResponse.json({ success: false, error: 'Too many attempts. Please try again in 1 hour.' })
  }

  // Check if user already exists
  const [existing] = await db
    .select({ id: schema.users.id, emailConfirmed: schema.users.emailConfirmed })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  if (existing) {
    // If user exists but email not confirmed, update password and resend confirmation
    if (!existing.emailConfirmed) {
      try {
        // Update password to the new one
        const newHash = await hashPassword(password)
        await db
          .update(schema.users)
          .set({ passwordHash: newHash, updatedAt: new Date() })
          .where(eq(schema.users.id, existing.id))

        const confirmToken = crypto.randomUUID()
        await db.insert(schema.emailConfirmTokens).values({
          userId: existing.id,
          token: confirmToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        })
        await sendEmailConfirmation(email, confirmToken)
      } catch (e) {
        console.error('Resend confirmation error:', e)
        notifyError('/api/auth/register', 'Resend confirmation error: ' + String(e))
      }
      return NextResponse.json({ success: true, message: 'Confirmation email resent' })
    }
    return NextResponse.json({ success: false, error: 'An account with this email already exists' })
  }

  // Hash password and insert user
  const passwordHash = await hashPassword(password)
  const [newUser] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      role: 'user',
      emailConfirmed: false,
    })
    .returning({ id: schema.users.id })

  // Generate confirm token and send confirmation email
  if (newUser) {
    try {
      const confirmToken = crypto.randomUUID()
      await db.insert(schema.emailConfirmTokens).values({
        userId: newUser.id,
        token: confirmToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      })
      await sendEmailConfirmation(email, confirmToken)
    } catch (e) {
      console.error('Email confirmation error:', e)
      notifyError('/api/auth/register', 'Email confirmation error: ' + String(e))
    }
  }

  // Free credit is granted after email confirmation (see confirm-email/route.ts)

  // Log successful registration (fire-and-forget)
  logActivity({
    action: 'register',
    userId: newUser?.id || '',
    email,
    ...getRequestInfo(request),
  }).catch(() => {})

  // Telegram notification with full useragent (fire-and-forget)
  const regInfo = getRequestInfo(request)
  notifyNewUser(email, { ip: regInfo.ip, userAgent: regInfo.userAgent, device: regInfo.device })

  return NextResponse.json({ success: true, message: 'Check your email to confirm your account' })
}
