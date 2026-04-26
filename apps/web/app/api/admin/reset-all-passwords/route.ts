import { db, schema } from '@/lib/db'
import { auth } from '@/lib/auth-config'
import { sendPasswordResetEmail } from '@/lib/email'
import { like } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get all users with placeholder passwords
  const users = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(like(schema.users.passwordHash, '%placeholder%'))

  const results: { email: string; status: string }[] = []

  for (const user of users) {
    try {
      // Generate reset token
      const token = crypto.randomUUID() + crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days for migration

      await db.insert(schema.passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      })

      await sendPasswordResetEmail(user.email, token)
      results.push({ email: user.email, status: 'sent' })
    } catch (e) {
      results.push({ email: user.email, status: `failed: ${String(e)}` })
    }
  }

  return NextResponse.json({ success: true, total: users.length, results })
}
