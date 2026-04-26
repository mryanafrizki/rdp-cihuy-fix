import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { completePayment, addBalance } from '@/lib/db/operations'
import { eq, and } from 'drizzle-orm'
import { notifyTopupSuccess, notifyError } from '@/lib/telegram-notify'

/**
 * Saweria PG Webhook Receiver
 *
 * Called by Cloudflare Gateway Worker when Saweria PG sends payment notification.
 * Gateway worker already verified HMAC signature, we verify x-gateway-secret.
 *
 * Payload from Saweria PG (forwarded by gateway worker):
 * {
 *   event: "payment.success" | "payment.expired" | "payment.failed",
 *   transaction_id: string,
 *   reference_id: string | null,
 *   amount: number,
 *   status: "paid" | "expired" | "failed",
 *   paid_at: string | null
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const gatewaySecret = request.headers.get('x-gateway-secret')
    const expectedSecret = process.env.GATEWAY_SECRET
    if (!expectedSecret || gatewaySecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json() as {
      event: string
      transaction_id: string
      reference_id: string | null
      amount: number
      status: string
      paid_at: string | null
    }

    const { event, transaction_id: gatewayId, reference_id: reffId, status: rawStatus } = payload
    if (!gatewayId) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const paymentStatus = (rawStatus || '').toLowerCase()

    console.log(`[webhook] Saweria ${event}: ref=${reffId} gateway_id=${gatewayId} status=${paymentStatus}`)

    const [tracking] = await db
      .select()
      .from(schema.paymentTracking)
      .where(eq(schema.paymentTracking.gatewayPaymentId, gatewayId))
      .limit(1)

    if (!tracking) {
      console.log(`[webhook] No tracking found for gateway_id=${gatewayId}`)
      return NextResponse.json({ status: 'ok', processed: false, reason: 'tracking not found' })
    }

    // Get transaction
    const [transaction] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, tracking.transactionId))
      .limit(1)

    if (!transaction) {
      console.log(`[webhook] No transaction found for tracking ${tracking.id}`)
      return NextResponse.json({ status: 'ok', processed: false, reason: 'transaction not found' })
    }

    // Already completed — skip (idempotent)
    if (transaction.status === 'completed') {
      return NextResponse.json({ status: 'ok', processed: false, reason: 'already completed' })
    }

    // Check if payment is successful
    const isSuccess = ['success', 'processing', 'settlement', 'capture', 'paid', 'completed'].includes(paymentStatus)

    if (isSuccess) {
      const txAmount = Number(transaction.amount)
      const userId = transaction.userId
      let credited = false

      try {
        credited = await completePayment(transaction.id, userId, txAmount)
      } catch {
        // Fallback: manual completion
        const txUpdate = await db
          .update(schema.transactions)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(and(eq(schema.transactions.id, transaction.id), eq(schema.transactions.status, 'pending')))
          .returning({ id: schema.transactions.id })

        if (txUpdate.length > 0) {
          try {
            await addBalance(userId, txAmount)
          } catch {
            const [currentUser] = await db
              .select({ creditBalance: schema.users.creditBalance })
              .from(schema.users)
              .where(eq(schema.users.id, userId))
              .limit(1)
            const newBalance = (Number(currentUser?.creditBalance) || 0) + txAmount
            await db
              .update(schema.users)
              .set({ creditBalance: String(newBalance), updatedAt: new Date() })
              .where(eq(schema.users.id, userId))
          }
          credited = true
        }
      }

      if (credited) {
        // Get user email for notification
        const [user] = await db
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, transaction.userId))
          .limit(1)

        notifyTopupSuccess(user?.email || '', txAmount)
        console.log(`[webhook] Payment completed: ${txAmount} credited to ${transaction.userId}`)
      }

      return NextResponse.json({ status: 'ok', processed: true, credited })
    }

    // Handle failed/expired/cancelled
    if (['expired', 'cancel', 'cancelled', 'failed'].includes(paymentStatus)) {
      const mappedStatus = ['cancel', 'cancelled'].includes(paymentStatus) ? 'cancelled' : paymentStatus === 'expired' ? 'expired' : 'failed'
      await db
        .update(schema.transactions)
        .set({ status: mappedStatus, updatedAt: new Date() })
        .where(and(eq(schema.transactions.id, transaction.id), eq(schema.transactions.status, 'pending')))

      console.log(`[webhook] Payment ${mappedStatus}: ${transaction.id}`)
      return NextResponse.json({ status: 'ok', processed: true, new_status: mappedStatus })
    }

    // Still processing — do nothing
    return NextResponse.json({ status: 'ok', processed: false, reason: `status=${paymentStatus}` })
  } catch (error: any) {
    console.error('[webhook] Error:', error)
    notifyError('/api/topup/webhook', String(error))
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
