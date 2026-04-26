import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, sql, and, gte, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Core counts
  const [
    [usersCount],
    [successCount],
    [failedCount],
    spentRows,
    refundRows,
    balanceRows,
    [cloudAccountsCount],
    [cloudDropletsCount],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(schema.users),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.installations).where(eq(schema.installations.status, 'completed')),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.installations).where(eq(schema.installations.status, 'failed')),
    db.select({ amount: schema.transactions.amount }).from(schema.transactions).where(and(eq(schema.transactions.type, 'deduction'), eq(schema.transactions.status, 'completed'))),
    db.select({ amount: schema.transactions.amount }).from(schema.transactions).where(sql`${schema.transactions.status} = 'completed' AND ${schema.transactions.paymentId} LIKE 'refund_%'`),
    db.select({ creditBalance: schema.users.creditBalance }).from(schema.users),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.doAccounts),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.doDroplets).where(eq(schema.doDroplets.status, 'active')),
  ])

  const totalSpent = spentRows.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalRefund = refundRows.reduce((s, t) => s + Number(t.amount), 0)
  const totalBalance = balanceRows.reduce((sum, u) => sum + Number(u.creditBalance || 0), 0)

  // Monthly data (last 6 months)
  const months: { month: string; success: number; failed: number; spent: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    const label = d.toLocaleString('en', { month: 'short' })

    const [[mSuccess], [mFailed], mSpent] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.installations)
        .where(and(eq(schema.installations.status, 'completed'), gte(schema.installations.createdAt, start), lte(schema.installations.createdAt, end))),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.installations)
        .where(and(eq(schema.installations.status, 'failed'), gte(schema.installations.createdAt, start), lte(schema.installations.createdAt, end))),
      db.select({ amount: schema.transactions.amount })
        .from(schema.transactions)
        .where(and(eq(schema.transactions.type, 'deduction'), eq(schema.transactions.status, 'completed'), gte(schema.transactions.createdAt, start), lte(schema.transactions.createdAt, end))),
    ])

    months.push({
      month: label,
      success: mSuccess?.count || 0,
      failed: mFailed?.count || 0,
      spent: mSpent.reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      totalUsers: usersCount?.count || 0,
      totalSuccess: successCount?.count || 0,
      totalFailed: failedCount?.count || 0,
      totalSpent: totalSpent - totalRefund,
      totalBalance,
      totalCloudAccounts: cloudAccountsCount?.count || 0,
      totalCloudDroplets: cloudDropletsCount?.count || 0,
      monthly: months,
    }
  })
}
