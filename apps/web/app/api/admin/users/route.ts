import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, desc, like, ilike, sql, count as drizzleCount } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Get total count
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(schema.users)
    if (search) {
      countQuery = countQuery.where(ilike(schema.users.email, `%${search}%`)) as typeof countQuery
    }
    const [countResult] = await countQuery
    const total = countResult?.count || 0

    // Get paginated users
    let usersQuery = db.select().from(schema.users)
    if (search) {
      usersQuery = usersQuery.where(ilike(schema.users.email, `%${search}%`)) as typeof usersQuery
    }
    const users = await usersQuery
      .orderBy(desc(schema.users.createdAt))
      .limit(limit)
      .offset(offset)

    // Enrich users with spent/install counts + cloud stats
    const enrichedUsers = await Promise.all(users.map(async (u) => {
      const [spentRows, refundRows, [installCount], [cloudAccountCount], [cloudDropletCount], lastLoginRows] = await Promise.all([
        db.select({ amount: schema.transactions.amount })
          .from(schema.transactions)
          .where(sql`${schema.transactions.userId} = ${u.id} AND ${schema.transactions.type} = 'deduction' AND ${schema.transactions.status} = 'completed'`),
        db.select({ amount: schema.transactions.amount })
          .from(schema.transactions)
          .where(sql`${schema.transactions.userId} = ${u.id} AND ${schema.transactions.status} = 'completed' AND ${schema.transactions.paymentId} LIKE 'refund_%'`),
        db.select({ count: sql<number>`count(*)::int` })
          .from(schema.installations)
          .where(sql`${schema.installations.userId} = ${u.id} AND ${schema.installations.status} = 'completed'`),
        db.select({ count: sql<number>`count(*)::int` })
          .from(schema.doAccounts)
          .where(eq(schema.doAccounts.userId, u.id)),
        db.select({ count: sql<number>`count(*)::int` })
          .from(schema.doDroplets)
          .where(eq(schema.doDroplets.userId, u.id)),
        db.select({ createdAt: schema.activityLog.createdAt })
          .from(schema.activityLog)
          .where(sql`${schema.activityLog.userId} = ${u.id} AND ${schema.activityLog.action} = 'login'`)
          .orderBy(desc(schema.activityLog.createdAt))
          .limit(1),
      ])

      const totalSpent = spentRows.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
      const totalRefund = refundRows.reduce((sum, t) => sum + Number(t.amount), 0)

      return {
        ...u,
        credit_balance: Number(u.creditBalance) || 0,
        created_at: u.createdAt,
        role: u.role,
        total_spent: totalSpent - totalRefund,
        total_success: installCount?.count || 0,
        last_login: lastLoginRows?.[0]?.createdAt || null,
        cloud_accounts: cloudAccountCount?.count || 0,
        cloud_droplets: cloudDropletCount?.count || 0,
      }
    }))

    // Sort by total_spent DESC, then email A-Z
    enrichedUsers.sort((a, b) => {
      if (b.total_spent !== a.total_spent) return b.total_spent - a.total_spent
      return (a.email || '').localeCompare(b.email || '')
    })

    return NextResponse.json({
      success: true,
      users: enrichedUsers,
      data: enrichedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      totalPages: Math.ceil(total / limit)
    })
  } catch (error: any) {
    notifyError('/api/admin/users', error.message || String(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }

  try {
    const { userId, role } = await request.json()
    if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    // Prevent changing own role
    if (userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
    }

    await db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))

    // Audit log: admin changed user role
    logActivity({
      action: 'admin_change_role',
      userId: session.user.id,
      email: session.user.email || 'unknown',
      ...getRequestInfo(request),
      details: { targetUserId: userId, newRole: role },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: any) {
    notifyError('/api/admin/users', error.message || String(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
