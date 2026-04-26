import { auth } from '@/lib/auth-config'
import { NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'
import { db, schema } from '@/lib/db'
import { eq, desc, and, count as drizzleCount, sql } from 'drizzle-orm'
import { toSnake } from '@/lib/utils'

export async function GET(request: Request) {
  const session = await auth()
  
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  
  const userId = session.user.id
  
  // Parse query parameters
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'completed' // default to completed only
  const type = searchParams.get('type')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  
  try {
    // Auto-expire pending transactions older than 15 minutes
    await db
      .update(schema.transactions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(
        eq(schema.transactions.userId, userId),
        eq(schema.transactions.status, 'pending'),
        sql`${schema.transactions.createdAt} < NOW() - INTERVAL '15 minutes'`
      ))

    // Build where conditions
    const conditions = [eq(schema.transactions.userId, userId)]
    
    // Apply status filter
    if (status && status !== 'all' && ['completed', 'failed', 'expired', 'cancelled', 'pending'].includes(status)) {
      conditions.push(eq(schema.transactions.status, status))
    }
    // 'all' shows everything including pending — no exclusion
    
    if (type && ['topup', 'deduction'].includes(type)) {
      conditions.push(eq(schema.transactions.type, type))
    }
    
    const whereClause = and(...conditions)
    
    // Get count
    const [countResult] = await db
      .select({ count: drizzleCount() })
      .from(schema.transactions)
      .where(whereClause)
    
    // Get paginated data
    const offset = (page - 1) * limit
    const data = await db
      .select()
      .from(schema.transactions)
      .where(whereClause)
      .orderBy(desc(schema.transactions.createdAt))
      .limit(limit)
      .offset(offset)
    
    return NextResponse.json({
      success: true,
      data: (data || []).map(t => toSnake({ ...t, amount: Number(t.amount) || 0 })),
      pagination: {
        page,
        limit,
        total: countResult?.count || 0
      }
    })
  } catch (error: any) {
    notifyError('/api/transactions', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
