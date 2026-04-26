import { NextRequest, NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

// Public endpoint — no auth required
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params

    // Fetch transaction
    const [transaction] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, paymentId))
      .limit(1)

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      )
    }

    // Fetch payment tracking
    const [tracking] = await db
      .select()
      .from(schema.paymentTracking)
      .where(eq(schema.paymentTracking.transactionId, paymentId))
      .limit(1)

    let currentStatus = transaction.status

    // If pending, check status through gateway worker
    if (transaction.status === 'pending' && tracking?.gatewayPaymentId) {
      const gatewayUrl = process.env.GATEWAY_URL
      const gatewaySecret = process.env.GATEWAY_SECRET
      if (gatewayUrl && gatewaySecret) {
        try {
          const statusRes = await fetch(`${gatewayUrl}/payment/status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-gateway-secret': gatewaySecret,
            },
            body: JSON.stringify({ id: tracking.gatewayPaymentId }),
          })
          const statusData = await statusRes.json()
          const paymentStatus = (statusData.data?.status || '').toLowerCase()

          if (['success', 'processing', 'settlement', 'capture', 'paid', 'completed'].includes(paymentStatus)) {
            await db
              .update(schema.transactions)
              .set({ status: 'completed', updatedAt: new Date() })
              .where(and(eq(schema.transactions.id, paymentId), eq(schema.transactions.status, 'pending')))
            currentStatus = 'completed'
          } else if (paymentStatus === 'expired') {
            await db
              .update(schema.transactions)
              .set({ status: 'expired', updatedAt: new Date() })
              .where(and(eq(schema.transactions.id, paymentId), eq(schema.transactions.status, 'pending')))
            currentStatus = 'expired'
          } else if (['cancel', 'cancelled', 'failed'].includes(paymentStatus)) {
            const mapped = paymentStatus === 'failed' ? 'failed' : 'cancelled'
            await db
              .update(schema.transactions)
              .set({ status: mapped, updatedAt: new Date() })
              .where(and(eq(schema.transactions.id, paymentId), eq(schema.transactions.status, 'pending')))
            currentStatus = mapped
          }
        } catch {
          /* ignore status check errors */
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        status: currentStatus,
        amount: transaction.amount,
        qr_string: tracking?.qrCodeUrl || '',
        expires_at: tracking?.expiresAt || '',
        created_at: transaction.createdAt,
      },
    })
  } catch (err) {
    console.error('Public payment fetch error:', err)
    notifyError('/api/pay', String(err))
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
