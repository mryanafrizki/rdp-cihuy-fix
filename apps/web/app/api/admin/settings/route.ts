import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await db.select().from(schema.appSettings)
  const settings: Record<string, any> = {}
  data.forEach(row => { settings[row.key] = row.value })
  return NextResponse.json({ success: true, data: settings })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }
  
  const { key, value } = await request.json()

  try {
    await db
      .insert(schema.appSettings)
      .values({ key, value, updatedAt: new Date(), updatedBy: session.user.id })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value, updatedAt: new Date(), updatedBy: session.user.id },
      })

    // Log admin settings change (fire-and-forget)
    logActivity({
      action: 'admin_settings_change',
      userId: session.user.id,
      email: session.user.email || 'unknown',
      ...getRequestInfo(request),
      details: { key, value },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: any) {
    notifyError('/api/admin/settings', error.message || String(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
