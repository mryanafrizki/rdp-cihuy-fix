import { eq, and, gt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyPasswordReset } from '@/lib/telegram-notify'

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ success: false, error: 'Token and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Find valid, unused token that hasn't expired
    const [resetToken] = await db
      .select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.token, token),
          eq(schema.passwordResetTokens.used, false),
          gt(schema.passwordResetTokens.expiresAt, new Date()),
        )
      )
      .limit(1)

    if (!resetToken) {
      return NextResponse.json({ success: false, error: 'Invalid or expired reset link. Please request a new one.' }, { status: 400 })
    }

    // Hash new password and update user
    const hashedPassword = await hashPassword(password)

    await db
      .update(schema.users)
      .set({ passwordHash: hashedPassword })
      .where(eq(schema.users.id, resetToken.userId))

    // Mark token as used
    await db
      .update(schema.passwordResetTokens)
      .set({ used: true })
      .where(eq(schema.passwordResetTokens.id, resetToken.id))

    // Get user email for logging
    const [user] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, resetToken.userId))
      .limit(1)

    // Log password reset (fire-and-forget)
    logActivity({
      action: 'reset_password',
      userId: resetToken.userId,
      email: user?.email || '',
      ...getRequestInfo(request),
    }).catch(() => {})

    // Telegram notification (fire-and-forget)
    notifyPasswordReset(user?.email || 'unknown')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset confirm error:', error)
    return NextResponse.json({ success: false, error: 'Failed to reset password' }, { status: 500 })
  }
}
