import { auth } from '@/lib/auth-config'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { notifyError } from '@/lib/telegram-notify'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { verifyTurnstile } from '@/lib/turnstile'

export async function POST(request: Request) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Rate limit: 5 requests per minute per user
    const { allowed } = checkRateLimit(`topup:${userId}`, 5, 60000)
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please wait.' }, { status: 429 })
    }

    // ensureUser is no longer needed — Auth.js users are created at signup via Drizzle

    const body = await request.json()
    const { amount, turnstileToken } = body

    // Verify Turnstile captcha
    if (!await verifyTurnstile(turnstileToken)) {
      return NextResponse.json({ success: false, error: 'Security verification failed.' }, { status: 400 })
    }
    
    if (typeof amount !== 'number' || amount < 1000 || amount > 10000000) {
      return NextResponse.json({ 
        success: false, 
        error: 'Amount must be between 1000 and 10000000' 
      }, { status: 400 })
    }

    // Block if user has a pending topup — must complete or cancel first
    const [pendingTx] = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.userId, userId),
        eq(schema.transactions.type, 'topup'),
        eq(schema.transactions.status, 'pending'),
      ))
      .limit(1)

    if (pendingTx) {
      return NextResponse.json({
        success: false,
        error: 'You have a pending payment. Please complete or cancel it first.',
        pending_transaction_id: pendingTx.id,
      }, { status: 400 })
    }
    
    const reffId = `topup_${userId.slice(0, 8)}_${Date.now()}`

    // Check fee mode from settings
    const [feeSettings] = await db
      .select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, 'fee_mode'))
      .limit(1)
    const rawValue = feeSettings?.value
    const feeMode = typeof rawValue === 'string' ? rawValue : ((rawValue as Record<string, string>)?.mode || 'user')

    // Calculate fees based on mode
    // Saweria always adds ~0.7% fee on their side (rounded up)
    let feePercent = 0
    let feeFlat = 0
    if (feeMode === 'user') {
      // User pays: our fee + Saweria fee
      feePercent = Math.ceil(amount * 0.007) // 0.7% our fee
      feeFlat = 200
    }
    const nominalToGateway = amount + feePercent + feeFlat

    // Estimate what Saweria will charge (they add ~0.7% and round up)
    const saweriaFee = Math.ceil(nominalToGateway * 0.007)
    const totalCharge = nominalToGateway + saweriaFee
    
    // Insert transaction record (amount = original credit the user receives)
    let transaction
    try {
      const [inserted] = await db
        .insert(schema.transactions)
        .values({ userId, amount: String(amount), type: 'topup', status: 'pending' })
        .returning({ id: schema.transactions.id })
      transaction = inserted
    } catch (txError: any) {
      return NextResponse.json({ 
        success: false, 
        error: txError?.message || 'Failed to create transaction' 
      }, { status: 500 })
    }
    
    if (!transaction) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create transaction' 
      }, { status: 500 })
    }
    
    // Call Saweria PG through Cloudflare Gateway Worker
    const gatewayUrl = process.env.GATEWAY_URL
    const gatewaySecret = process.env.GATEWAY_SECRET
    if (!gatewayUrl || !gatewaySecret) {
      return NextResponse.json({ success: false, error: 'Payment gateway not configured' }, { status: 500 })
    }

    const gatewayResponse = await fetch(`${gatewayUrl}/payment/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-secret': gatewaySecret,
      },
      body: JSON.stringify({
        reff_id: reffId,
        nominal: totalCharge.toString(),
      }),
    })

    const gatewayData = await gatewayResponse.json()

    if (!gatewayData.status || !gatewayData.data) {
      await db
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, transaction.id))
      return NextResponse.json({ 
        success: false, 
        error: gatewayData.message || 'Payment creation failed' 
      }, { status: 500 })
    }

    const paymentData = gatewayData.data

    await db
      .insert(schema.paymentTracking)
      .values({
        transactionId: transaction.id,
        qrCodeUrl: paymentData.qr_string,
        gatewayPaymentId: paymentData.id,
        expiresAt: new Date(paymentData.expired_at)
      })

    return NextResponse.json({ 
      success: true, 
      data: {
        transaction_id: transaction.id,
        gateway_id: paymentData.id,
        qr_string: paymentData.qr_string,
        amount: amount,
        total_charge: totalCharge,
        fee_percent: feePercent,
        fee_flat: feeFlat,
        expires_at: paymentData.expired_at
      }
    })
  } catch (error: any) {
    console.error('Topup error:', error)
    notifyError('/api/topup', String(error))
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
