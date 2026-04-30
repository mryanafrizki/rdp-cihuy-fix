import { auth } from '@/lib/auth-config'
import { NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'
import { db, schema } from '@/lib/db'
import { addBalance } from '@/lib/db/operations'
import { eq, and, count as drizzleCount, desc, inArray, sql } from 'drizzle-orm'
import { toSnake } from '@/lib/utils'

export async function GET(request: Request) {
  const session = await auth()
  
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  
  const userId = session.user.id
  
  // Parse query parameters
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  
  try {
    // Auto-resolve stuck installations (>20min in_progress)
    // If progress >= 80: likely completed (Windows booted but verify stuck)
    // If progress < 80: mark as failed
    await db
      .update(schema.installations)
      .set({ status: 'completed', progressStep: 100, progressMessage: 'Installation completed (auto-resolved)', completedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(schema.installations.userId, userId),
        eq(schema.installations.status, 'in_progress'),
        sql`${schema.installations.progressStep} >= 80`,
        sql`${schema.installations.updatedAt} < NOW() - INTERVAL '20 minutes'`
      ))
    await db
      .update(schema.installations)
      .set({ status: 'failed', progressMessage: 'Installation timed out', updatedAt: new Date() })
      .where(and(
        eq(schema.installations.userId, userId),
        eq(schema.installations.status, 'in_progress'),
        sql`${schema.installations.progressStep} < 80`,
        sql`${schema.installations.updatedAt} < NOW() - INTERVAL '20 minutes'`
      ))

    // Build where conditions
    const conditions = [eq(schema.installations.userId, userId)]
    
    // Apply filters
    if (status && ['pending', 'in_progress', 'completed', 'failed'].includes(status)) {
      conditions.push(eq(schema.installations.status, status))
    }
    
    const whereClause = and(...conditions)
    
    // Get count
    const [countResult] = await db
      .select({ count: drizzleCount() })
      .from(schema.installations)
      .where(whereClause)
    
    // Get paginated data
    const offset = (page - 1) * limit
    const data = await db
      .select()
      .from(schema.installations)
      .where(whereClause)
      .orderBy(desc(schema.installations.createdAt))
      .limit(limit)
      .offset(offset)
    
    // Auto-fail installations older than 30 minutes
    const installations = data || []
    const now = new Date()
    for (const inst of installations) {
      if (['pending', 'in_progress'].includes(inst.status)) {
        const created = new Date(inst.createdAt!)
        const diffMin = (now.getTime() - created.getTime()) / 60000
        if (diffMin > 30) {
          await db
            .update(schema.installations)
            .set({ status: 'failed', progressMessage: 'Timeout: proses melebihi 30 menit. Saldo telah dikembalikan. Silakan hubungi admin untuk bantuan.' })
            .where(eq(schema.installations.id, inst.id))
          inst.status = 'failed'
          inst.progressMessage = 'Timeout: proses melebihi 30 menit. Saldo telah dikembalikan. Silakan hubungi admin untuk bantuan.'

          // Auto-refund for timed out installations (atomic: insert-first to prevent duplicates)
          const [deductionTx] = await db
            .select({ amount: schema.transactions.amount })
            .from(schema.transactions)
            .where(eq(schema.transactions.paymentId, `install_${inst.id}`))
            .limit(1)

          const refundAmount = Math.abs(Number(deductionTx?.amount) || 1000)

          try {
            await db
              .insert(schema.transactions)
              .values({
                userId: inst.userId,
                amount: String(refundAmount),
                type: 'topup',
                status: 'completed',
                paymentId: `refund_${inst.id}`
              })

            // Only add balance if insert succeeded (no duplicate)
            await addBalance(inst.userId, refundAmount)
          } catch {
            // Insert failed (duplicate payment_id) — refund already processed
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      data: installations.map(i => toSnake(i as Record<string, unknown>)),
      pagination: {
        page,
        limit,
        total: countResult?.count || 0
      }
    })
  } catch (error: any) {
    notifyError('/api/installations', error.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
