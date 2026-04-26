import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, sessionId: null })
  }

  // Check user_sessions table for active session
  const [userSession] = await db
    .select({ id: schema.userSessions.id, sessionId: schema.userSessions.sessionId })
    .from(schema.userSessions)
    .where(eq(schema.userSessions.userId, session.user.id))
    .limit(1)

  return NextResponse.json({
    valid: !!userSession,
    sessionId: userSession?.sessionId || null,
  })
}
