import { auth } from '@/lib/auth-config'
import { NextRequest, NextResponse } from 'next/server'
import { notifyTopupSuccess, notifyError } from '@/lib/telegram-notify'
import { db, schema } from '@/lib/db'
import { completePayment, addBalance } from '@/lib/db/operations'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const session = await auth()
  
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const transactionId = request.nextUrl.searchParams.get('transaction_id')
  
  if (!transactionId) {
    return NextResponse.json({ success: false, error: 'transaction_id required' }, { status: 400 })
  }

  // Get transaction
  const [transaction] = await db
    .select()
    .from(schema.transactions)
    .where(and(
      eq(schema.transactions.id, transactionId),
      eq(schema.transactions.userId, userId)
    ))
    .limit(1)

  if (!transaction) {
    return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
  }

  // Get payment tracking for this transaction
  const [tracking] = await db
    .select()
    .from(schema.paymentTracking)
    .where(eq(schema.paymentTracking.transactionId, transactionId))
    .limit(1)

  // If already completed or failed, return current status
  if (transaction.status === 'completed') {
    return NextResponse.json({ success: true, data: { status: 'completed', credited: true } })
  }
  if (transaction.status === 'failed') {
    return NextResponse.json({ success: true, data: { status: 'failed' } })
  }

  if (!tracking || !tracking.gatewayPaymentId) {
    return NextResponse.json({ success: true, data: { status: 'pending', message: 'No payment tracking data' } })
  }

  // Check if expired - mark as expired (keep for activity history)
  if (tracking.expiresAt && new Date(tracking.expiresAt) < new Date()) {
    await db
      .update(schema.transactions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(eq(schema.transactions.id, transactionId), eq(schema.transactions.status, 'pending')))
    return NextResponse.json({ success: true, data: { status: 'expired' } })
  }

  // Check payment status through Cloudflare Worker gateway
  const gatewayUrl = process.env.GATEWAY_URL || 'https://gate1.eov.my.id'
  const gatewaySecret = process.env.GATEWAY_SECRET
  if (!gatewaySecret) {
    return NextResponse.json({ success: true, data: { status: 'pending', message: 'Payment gateway not configured' } })
  }

  try {
    const statusResponse = await fetch(`${gatewayUrl}/payment/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-secret': gatewaySecret,
      },
      body: JSON.stringify({ id: tracking.gatewayPaymentId }),
    })

    const statusData = await statusResponse.json()

    // Update poll count
    await db
      .update(schema.paymentTracking)
      .set({ pollCount: (tracking.pollCount || 0) + 1 })
      .where(eq(schema.paymentTracking.id, tracking.id))

    if (statusData.status && statusData.data) {
      const paymentStatus = statusData.data.status?.toLowerCase() || 'pending'
      
      // Success statuses: payment received or completed
      const isSuccess = ['success', 'processing', 'settlement', 'capture', 'paid', 'completed'].includes(paymentStatus)

      if (isSuccess) {
        // Atomic payment completion - prevents double-credit
        const txAmount = Number(transaction.amount)
        let credited = false
        
        try {
          credited = await completePayment(transactionId, userId, txAmount)
        } catch {
          // completePayment failed — fallback to manual
          // Step 1: Atomically mark transaction as completed (only if pending)
          const txUpdate = await db
            .update(schema.transactions)
            .set({ status: 'completed', updatedAt: new Date() })
            .where(and(eq(schema.transactions.id, transactionId), eq(schema.transactions.status, 'pending')))
            .returning({ id: schema.transactions.id })
          
          if (txUpdate.length > 0) {
            // Step 2: Add balance
            try {
              await addBalance(userId, txAmount)
            } catch {
              // addBalance failed — direct update
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
          // Telegram notification (fire-and-forget)
          notifyTopupSuccess(session.user.email || '', txAmount)

          return NextResponse.json({ 
            success: true, 
            data: { status: 'completed', credited: true, amount: txAmount } 
          })
        } else {
          // Already completed by another request
          return NextResponse.json({ 
            success: true, 
            data: { status: 'completed', credited: false } 
          })
        }
      }

      // Check if expired or cancelled
      if (['expired', 'cancel', 'cancelled', 'failed'].includes(paymentStatus)) {
        const mappedStatus = ['cancel', 'cancelled'].includes(paymentStatus) ? 'cancelled' : paymentStatus === 'expired' ? 'expired' : 'failed'
        await db
          .update(schema.transactions)
          .set({ status: mappedStatus })
          .where(eq(schema.transactions.id, transactionId))
        
        return NextResponse.json({ success: true, data: { status: mappedStatus } })
      }

      // Still pending
      return NextResponse.json({ success: true, data: { status: 'pending' } })
    }

    // Status check failed but not critical
    return NextResponse.json({ success: true, data: { status: 'pending' } })
  } catch (error) {
    console.error('Payment status check error:', error)
    notifyError('/api/topup/status', String(error))
    return NextResponse.json({ success: true, data: { status: 'pending' } })
  }
}
