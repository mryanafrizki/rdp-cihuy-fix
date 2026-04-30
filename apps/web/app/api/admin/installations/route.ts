import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, desc, sql, and, ilike } from 'drizzle-orm'
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
    // Auto-resolve stuck installations (>20min in_progress)
    await db
      .update(schema.installations)
      .set({ status: 'completed', progressStep: 100, progressMessage: 'Installation completed (auto-resolved)', completedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(schema.installations.status, 'in_progress'),
        sql`${schema.installations.progressStep} >= 80`,
        sql`${schema.installations.updatedAt} < NOW() - INTERVAL '20 minutes'`
      ))
    await db
      .update(schema.installations)
      .set({ status: 'failed', progressMessage: 'Installation timed out', updatedAt: new Date() })
      .where(and(
        eq(schema.installations.status, 'in_progress'),
        sql`${schema.installations.progressStep} < 80`,
        sql`${schema.installations.updatedAt} < NOW() - INTERVAL '20 minutes'`
      ))

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const user_id = searchParams.get('user_id')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build conditions
    const conditions: any[] = []
    if (search) conditions.push(ilike(schema.installations.installId, `%${search}%`))
    if (status) conditions.push(eq(schema.installations.status, status))
    if (user_id) conditions.push(eq(schema.installations.userId, user_id))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.installations)
      .where(whereClause)

    const total = countResult?.count || 0

    // Get installations with user email via join
    const installations = await db
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
      .where(whereClause)
      .orderBy(desc(schema.installations.createdAt))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({
      success: true,
      data: installations.map(i => ({ ...toSnake(i as Record<string, unknown>), users: i.users })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    notifyError('/api/admin/installations', error.message || String(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
