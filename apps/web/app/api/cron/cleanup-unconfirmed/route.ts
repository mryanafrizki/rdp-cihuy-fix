import { db, schema } from '@/lib/db'
import { eq, and, lt, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Cleanup cron:
 * 1. Delete unconfirmed users older than 3 days (CASCADE cleans related records)
 * 2. Delete expired/used email confirm tokens older than 7 days
 * 3. Delete expired/used password reset tokens older than 7 days
 *
 * Trigger via cron: POST /api/cron/cleanup-unconfirmed
 * Header: x-cron-secret: <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // 1. Delete unconfirmed users older than 3 days
    const deleted = await db
      .delete(schema.users)
      .where(and(
        eq(schema.users.emailConfirmed, false),
        lt(schema.users.createdAt, threeDaysAgo),
      ))
      .returning({ id: schema.users.id, email: schema.users.email })

    // 2. Delete old email confirm tokens (used or expired, older than 7 days)
    const deletedTokens = await db
      .delete(schema.emailConfirmTokens)
      .where(lt(schema.emailConfirmTokens.createdAt, sevenDaysAgo))
      .returning({ id: schema.emailConfirmTokens.id })

    // 3. Delete old password reset tokens (used or expired, older than 7 days)
    const deletedResetTokens = await db
      .delete(schema.passwordResetTokens)
      .where(lt(schema.passwordResetTokens.createdAt, sevenDaysAgo))
      .returning({ id: schema.passwordResetTokens.id })

    console.log(`[cron] Cleanup: ${deleted.length} unconfirmed users, ${deletedTokens.length} email tokens, ${deletedResetTokens.length} reset tokens`)

    return NextResponse.json({
      success: true,
      deleted_users: deleted.length,
      deleted_email_tokens: deletedTokens.length,
      deleted_reset_tokens: deletedResetTokens.length,
    })
  } catch (error) {
    console.error('[cron] Cleanup error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
