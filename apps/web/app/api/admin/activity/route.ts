import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, desc, sql, inArray, ilike } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { readActivityLogs } from '@/lib/activity-logger'
import { toSnake } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const installId = searchParams.get('install_id')

  // If searching by install_id
  if (installId) {
    const data = await db
      .select({
        id: schema.installations.id,
        userId: schema.installations.userId,
        installId: schema.installations.installId,
        vpsIp: schema.installations.vpsIp,
        windowsVersion: schema.installations.windowsVersion,
        rdpType: schema.installations.rdpType,
        status: schema.installations.status,
        progressStep: schema.installations.progressStep,
        progressMessage: schema.installations.progressMessage,
        createdAt: schema.installations.createdAt,
        updatedAt: schema.installations.updatedAt,
        completedAt: schema.installations.completedAt,
        users: {
          email: schema.users.email,
        },
      })
      .from(schema.installations)
      .innerJoin(schema.users, eq(schema.installations.userId, schema.users.id))
      .where(ilike(schema.installations.installId, `%${installId}%`))
      .orderBy(desc(schema.installations.updatedAt))
      .limit(10)

    return NextResponse.json({ success: true, data: data.map(d => ({ ...toSnake(d as Record<string, unknown>), users: d.users })) })
  }

  // Global recent activity (core)
  const [txData, instData] = await Promise.all([
    db.select({
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
    .orderBy(desc(schema.transactions.updatedAt))
    .limit(20),

    db.select({
      id: schema.installations.id,
      userId: schema.installations.userId,
      installId: schema.installations.installId,
      vpsIp: schema.installations.vpsIp,
      windowsVersion: schema.installations.windowsVersion,
      rdpType: schema.installations.rdpType,
      status: schema.installations.status,
      progressStep: schema.installations.progressStep,
      progressMessage: schema.installations.progressMessage,
      createdAt: schema.installations.createdAt,
      updatedAt: schema.installations.updatedAt,
      completedAt: schema.installations.completedAt,
      users: {
        email: schema.users.email,
      },
    })
    .from(schema.installations)
    .innerJoin(schema.users, eq(schema.installations.userId, schema.users.id))
    .where(inArray(schema.installations.status, ['in_progress', 'completed', 'failed']))
    .orderBy(desc(schema.installations.updatedAt))
    .limit(20),
  ])

  // File-based activity logs (auth + cloud actions are all in the same file now)
  const authActivity = await readActivityLogs({ limit: 50 })

  return NextResponse.json({
    success: true,
    transactions: txData.map(t => ({ ...toSnake(t as Record<string, unknown>), users: t.users })),
    installations: instData.map(i => ({ ...toSnake(i as Record<string, unknown>), users: i.users })),
    cloud_activity: [],
    auth_activity: authActivity,
  })
}
