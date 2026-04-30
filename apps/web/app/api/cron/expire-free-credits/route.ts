import { db, schema } from '@/lib/db'
import { eq, and, lt, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Expire free credits after 7 days.
 * Deducts min(free_credit_amount, current_balance) from user balance.
 *
 * Trigger via cron: POST /api/cron/expire-free-credits
 * Header: x-cron-secret: <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find expired free credits that haven't been processed
    const expiredCredits = await db
      .select({
        id: schema.freeCreditTracking.id,
        userId: schema.freeCreditTracking.userId,
        amount: schema.freeCreditTracking.amount,
      })
      .from(schema.freeCreditTracking)
      .where(and(
        eq(schema.freeCreditTracking.expired, false),
        lt(schema.freeCreditTracking.expiresAt, new Date()),
      ))

    let processed = 0
    for (const credit of expiredCredits) {
      const deductAmount = Number(credit.amount)

      // Get current balance
      const [user] = await db
        .select({ creditBalance: schema.users.creditBalance })
        .from(schema.users)
        .where(eq(schema.users.id, credit.userId))
        .limit(1)

      if (!user) continue

      const currentBalance = Number(user.creditBalance ?? 0)
      // Deduct min(free_credit_amount, current_balance) — don't go negative
      const actualDeduct = Math.min(deductAmount, currentBalance)

      if (actualDeduct > 0) {
        await db
          .update(schema.users)
          .set({
            creditBalance: sql`GREATEST(credit_balance::numeric - ${actualDeduct}, 0)`,
            updatedAt: sql`now()`,
          })
          .where(eq(schema.users.id, credit.userId))

        // Record deduction transaction
        await db.insert(schema.transactions).values({
          userId: credit.userId,
          amount: String(-actualDeduct),
          type: 'deduction',
          status: 'completed',
          paymentId: `free_credit_expired_${credit.id}`,
        })
      }

      // Mark as expired
      await db
        .update(schema.freeCreditTracking)
        .set({ expired: true, expiredAmount: String(actualDeduct) })
        .where(eq(schema.freeCreditTracking.id, credit.id))

      processed++
    }

    return NextResponse.json({ success: true, processed })
  } catch (error) {
    console.error('[cron] Expire free credits error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
