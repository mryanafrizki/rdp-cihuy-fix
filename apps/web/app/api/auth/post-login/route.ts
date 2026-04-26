import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { auth } from '@/lib/auth-config'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'


export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ ok: false })

  const { email } = await request.json()

  // Upsert user session
  try {
    const sessionId = crypto.randomUUID()
    await db
      .insert(schema.userSessions)
      .values({
        userId: session.user.id,
        sessionId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.userSessions.userId,
        set: { sessionId, updatedAt: new Date() },
      })
  } catch {
    // Non-fatal
  }

  // Log login (fire-and-forget)
  const info = getRequestInfo(request)
  logActivity({
    action: 'login',
    userId: session.user.id,
    email: email || session.user.email || 'unknown',
    ...info,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
