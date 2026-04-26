import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { auth } from '@/lib/auth-config'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'

export async function POST(request: Request) {
  const session = await auth()

  // Delete user_sessions row so single-session enforcement knows this session is gone
  if (session?.user?.id) {
    try {
      await db
        .delete(schema.userSessions)
        .where(eq(schema.userSessions.userId, session.user.id))
    } catch {
      // Non-fatal
    }
  }

  // Log logout (fire-and-forget)
  if (session?.user) {
    logActivity({
      action: 'logout',
      userId: session.user.id,
      email: session.user.email || 'unknown',
      ...getRequestInfo(request),
    }).catch(() => {})
  }

  // The actual session invalidation happens client-side via signOut() from next-auth/react
  return NextResponse.json({ success: true })
}
