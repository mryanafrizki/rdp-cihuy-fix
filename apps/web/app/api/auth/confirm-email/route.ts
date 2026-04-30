import { eq, and, gt, sql } from 'drizzle-orm'
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

  // Atomically: mark token used + confirm email + grant free credit
  await db.transaction(async (tx) => {
    // Mark token as used
    await tx
      .update(schema.emailConfirmTokens)
      .set({ used: true })
      .where(eq(schema.emailConfirmTokens.id, record.id))

    // Set user email_confirmed = true
    await tx
      .update(schema.users)
      .set({ emailConfirmed: true })
      .where(eq(schema.users.id, record.userId))

    // Grant free credit after email confirmation (with 7-day expiry)
    try {
      const [fcSettings] = await tx
        .select({ value: schema.appSettings.value })
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, 'free_credit'))
        .limit(1)

      const freeCredit = fcSettings?.value as { enabled?: boolean; amount?: number } | null

      if (freeCredit?.enabled && freeCredit.amount && freeCredit.amount > 0) {
        // Prevent double-claim (unique constraint on userId will also catch this)
        const [existing] = await tx
          .select({ id: schema.freeCreditTracking.id })
          .from(schema.freeCreditTracking)
          .where(eq(schema.freeCreditTracking.userId, record.userId))
          .limit(1)

        if (!existing) {
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

          // Add balance atomically
          await tx
            .update(schema.users)
            .set({
              creditBalance: sql`COALESCE(credit_balance::numeric, 0) + ${freeCredit.amount}`,
              updatedAt: sql`now()`,
            })
            .where(eq(schema.users.id, record.userId))

          // Track free credit with expiry
          await tx.insert(schema.freeCreditTracking).values({
            userId: record.userId,
            amount: String(freeCredit.amount),
            expiresAt,
          })

          // Transaction record with unique paymentId per user
          await tx.insert(schema.transactions).values({
            userId: record.userId,
            amount: String(freeCredit.amount),
            type: 'topup',
            status: 'completed',
            paymentId: `welcome_bonus_${record.userId}`,
          })
        }
      }
    } catch (e) {
      // Non-fatal — free credit failure should not rollback email confirmation
      console.error('[confirm-email] Free credit error:', e)
    }
  })

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
