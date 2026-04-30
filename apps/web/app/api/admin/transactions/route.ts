import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, desc, sql, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'
import { toSnake } from '@/lib/utils'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const user_id = searchParams.get('user_id')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build conditions
    const conditions: any[] = []
    if (status && status !== 'all') conditions.push(eq(schema.transactions.status, status))
    if (type) conditions.push(eq(schema.transactions.type, type))
    if (user_id) conditions.push(eq(schema.transactions.userId, user_id))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.transactions)
      .where(whereClause)

    const total = countResult?.count || 0

    // Get transactions with user email via join
    const transactions = await db
      .select({
        id: schema.transactions.id,
        userId: schema.transactions.userId,
        amount: schema.transactions.amount,
        type: schema.transactions.type,
        status: schema.transactions.status,
        paymentId: schema.transactions.paymentId,
        createdAt: schema.transactions.createdAt,
        updatedAt: schema.transactions.updatedAt,
        users: {
          email: schema.users.email,
        },
      })
      .from(schema.transactions)
      .innerJoin(schema.users, eq(schema.transactions.userId, schema.users.id))
      .where(whereClause)
      .orderBy(desc(schema.transactions.createdAt))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({
      success: true,
      data: transactions.map(t => ({ ...toSnake(t as Record<string, unknown>), users: t.users, amount: Number(t.amount) || 0 })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    notifyError('/api/admin/transactions', error.message || String(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
