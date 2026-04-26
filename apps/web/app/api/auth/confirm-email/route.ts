import { eq, and, gt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url))
  }

  // Look up token — not expired, not used
  const [record] = await db
    .select()
    .from(schema.emailConfirmTokens)
    .where(
      and(
        eq(schema.emailConfirmTokens.token, token),
        eq(schema.emailConfirmTokens.used, false),
        gt(schema.emailConfirmTokens.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!record) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired_token', request.url))
  }

  // Mark token as used
  await db
    .update(schema.emailConfirmTokens)
    .set({ used: true })
    .where(eq(schema.emailConfirmTokens.id, record.id))

  // Set user email_confirmed = true
  await db
    .update(schema.users)
    .set({ emailConfirmed: true })
    .where(eq(schema.users.id, record.userId))

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
