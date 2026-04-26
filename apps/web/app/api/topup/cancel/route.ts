import { auth } from '@/lib/auth-config'
import { NextRequest, NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const { transaction_id } = await request.json()

    // Get transaction
    const [tx] = await db
      .select()
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.id, transaction_id),
        eq(schema.transactions.userId, userId)
      ))
      .limit(1)

    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Get payment tracking
    const [tracking] = await db
      .select()
      .from(schema.paymentTracking)
      .where(eq(schema.paymentTracking.transactionId, transaction_id))
      .limit(1)

    // Saweria has no cancel API — payments expire automatically (~15 min)

    // Mark as cancelled (preserve for transaction history)
    await db
      .update(schema.transactions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(schema.transactions.id, transaction_id), eq(schema.transactions.status, 'pending')))
    // Clean up payment tracking (QR no longer valid)
    await db
      .delete(schema.paymentTracking)
      .where(eq(schema.paymentTracking.transactionId, transaction_id))

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    notifyError('/api/topup/cancel', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
