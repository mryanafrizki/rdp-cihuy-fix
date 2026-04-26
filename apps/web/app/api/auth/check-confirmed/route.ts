import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    // IP-based rate limit for login attempts: 10 per minute
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('cf-connecting-ip') ||
               request.headers.get('x-real-ip') || 'unknown'
    const { allowed } = checkRateLimit(`login-ip:${ip}`, 10, 60000)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many login attempts. Please wait.' }, { status: 429 })
    }

    const { email } = await request.json()
    if (!email) return NextResponse.json({ confirmed: true })

    const [user] = await db
      .select({ emailConfirmed: schema.users.emailConfirmed })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)

    if (!user) return NextResponse.json({ confirmed: true }) // Don't leak user existence
    return NextResponse.json({ confirmed: user.emailConfirmed })
  } catch (error) {
    console.error('[check-confirmed] Error:', error)
    // On error, allow login attempt (authorize callback will validate)
    return NextResponse.json({ confirmed: true })
  }
}
