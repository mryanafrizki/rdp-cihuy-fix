import { auth } from '@/lib/auth-config'
import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { addBalance } from '@/lib/db/operations'
import { eq, and } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const { installation_id } = await request.json()
  if (!installation_id) {
    return NextResponse.json({ success: false, error: 'installation_id required' }, { status: 400 })
  }

  // Get installation
  const [installation] = await db
    .select()
    .from(schema.installations)
    .where(and(
      eq(schema.installations.id, installation_id),
      eq(schema.installations.userId, userId)
    ))
    .limit(1)

  if (!installation) {
    return NextResponse.json({ success: false, error: 'Installation not found' }, { status: 404 })
  }

  if (installation.status !== 'failed') {
    return NextResponse.json({ success: false, error: 'Can only refund failed installations' }, { status: 400 })
  }

  // Fetch actual price from the deduction transaction for this installation
  const [deductionTx] = await db
    .select({ amount: schema.transactions.amount })
    .from(schema.transactions)
    .where(eq(schema.transactions.paymentId, `install_${installation_id}`))
    .limit(1)

  const refundAmount = Math.abs(Number(deductionTx?.amount) || 0)
  if (refundAmount <= 0) {
    return NextResponse.json({ success: false, error: 'No deduction found for this installation' }, { status: 400 })
  }

  // 1. Atomically insert refund transaction (fails if duplicate via unique index)
  let refundTx
  try {
    const [inserted] = await db
      .insert(schema.transactions)
      .values({
        userId,
        amount: String(refundAmount),
        type: 'topup',
        status: 'completed',
        paymentId: `refund_${installation_id}`
      })
      .returning({ id: schema.transactions.id })
    refundTx = inserted
  } catch {
    // If insert fails (duplicate payment_id), refund already processed
    return NextResponse.json({ success: false, error: 'Already refunded' }, { status: 400 })
  }

  // 2. Atomically add balance
  await addBalance(userId, refundAmount)

  return NextResponse.json({ success: true, message: 'Refund processed', amount: refundAmount })
}
