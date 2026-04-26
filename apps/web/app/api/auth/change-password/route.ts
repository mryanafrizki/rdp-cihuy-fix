import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { auth } from '@/lib/auth-config'
import { verifyPassword, hashPassword } from '@/lib/password'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyPasswordChange } from '@/lib/telegram-notify'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await request.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ success: false, error: 'Current password and new password are required' })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ success: false, error: 'New password must be at least 6 characters' })
  }

  // Get user's current password hash
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1)

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  // Verify current password
  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ success: false, error: 'Current password is incorrect' })
  }

  // Hash new password and update
  const newHash = await hashPassword(newPassword)
  await db
    .update(schema.users)
    .set({
      passwordHash: newHash,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id))

  // Log password change (fire-and-forget)
  logActivity({
    action: 'change_password',
    userId: user.id,
    email: user.email || 'unknown',
    ...getRequestInfo(request),
  }).catch(() => {})

  // Telegram notification (fire-and-forget)
  notifyPasswordChange(user.email || 'unknown')

  // Invalidate all sessions so user must re-login
  try {
    await db
      .delete(schema.userSessions)
      .where(eq(schema.userSessions.userId, user.id))
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true })
}
