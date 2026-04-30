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

    // Read-only status check — DB updates are handled by webhook and /api/topup/status
    let gatewayStatus = 'pending'
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
          gatewayStatus = (statusData.data?.status || 'pending').toLowerCase()
        } catch {
          /* ignore status check errors */
        }
      }
    }

    const currentStatus = transaction.status === 'pending' ? gatewayStatus : transaction.status

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
