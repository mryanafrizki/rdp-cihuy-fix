import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, and, asc, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'
import { toSnake } from '@/lib/utils'
import { parseProxyList } from '@/lib/proxy-utils'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await db
    .select()
    .from(schema.doProxies)
    .where(eq(schema.doProxies.userId, session.user.id))
    .orderBy(asc(schema.doProxies.createdAt))

  const [user] = await db
    .select({ proxyMode: schema.users.proxyMode })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1)

  return NextResponse.json({
    success: true,
    data: data.map(d => toSnake(d as Record<string, unknown>)),
    proxyMode: user?.proxyMode || 'disabled',
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 10 requests per minute per user
  const { allowed } = checkRateLimit(`proxies:${session.user.id}`, 10, 60000)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })
  }

  const body = await request.json()

  // Mass add mode
  if (body.proxies && typeof body.proxies === 'string') {
    const { proxies: parsed, errors } = parseProxyList(body.proxies)
    if (parsed.length === 0) {
      return NextResponse.json({ error: 'No valid proxies found', errors }, { status: 400 })
    }

    // Check limit
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.doProxies)
      .where(eq(schema.doProxies.userId, session.user.id))
    const current = countResult?.count || 0
    const available = 30 - current
    const toAdd = parsed.slice(0, available)

    if (toAdd.length === 0) {
      return NextResponse.json({ error: 'Proxy limit reached (30 max)' }, { status: 400 })
    }

    const inserted = await db
      .insert(schema.doProxies)
      .values(toAdd.map(p => ({
        userId: session.user.id,
        protocol: p.protocol,
        host: p.host,
        port: p.port,
        username: p.username,
        password: p.password,
      })))
      .returning()

    logActivity({ action: 'cloud_mass_add_proxy', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { count: inserted.length } }).catch(() => {})

    return NextResponse.json({
      success: true,
      added: inserted.length,
      skipped: parsed.length - toAdd.length,
      errors,
    })
  }

  // Single add mode
  const { protocol, host, port, username, password, label } = body
  if (!host || !port) return NextResponse.json({ error: 'Host and port required' }, { status: 400 })

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.doProxies)
    .where(eq(schema.doProxies.userId, session.user.id))

  if ((countResult?.count || 0) >= 30) return NextResponse.json({ error: 'Maximum 30 proxies' }, { status: 400 })

  try {
    const [data] = await db
      .insert(schema.doProxies)
      .values({
        userId: session.user.id,
        protocol: protocol || 'http',
        host,
        port,
        username,
        password,
        label,
      })
      .returning()

    logActivity({ action: 'cloud_add_proxy', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { protocol: protocol || 'http', host, port, label } }).catch(() => {})

    return NextResponse.json({ success: true, data: toSnake(data as Record<string, unknown>) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    notifyError('/api/cloud/proxies', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Set proxy mode
  if (body.action === 'set_mode') {
    const mode = body.mode
    if (!['disabled', 'manual', 'rotate'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }
    await db
      .update(schema.users)
      .set({ proxyMode: mode })
      .where(eq(schema.users.id, session.user.id))

    // If switching to manual/rotate, deselect all first
    if (mode === 'disabled') {
      await db
        .update(schema.doProxies)
        .set({ isSelected: false })
        .where(eq(schema.doProxies.userId, session.user.id))
    }

    return NextResponse.json({ success: true })
  }

  // Select/deselect proxy (existing behavior)
  const { id, is_selected } = body

  // Deselect all first
  await db
    .update(schema.doProxies)
    .set({ isSelected: false })
    .where(eq(schema.doProxies.userId, session.user.id))

  // Select the chosen one
  if (is_selected && id) {
    await db
      .update(schema.doProxies)
      .set({ isSelected: true })
      .where(and(eq(schema.doProxies.id, id), eq(schema.doProxies.userId, session.user.id)))
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Mass delete failed
  if (body.action === 'delete_failed') {
    const result = await db
      .delete(schema.doProxies)
      .where(and(eq(schema.doProxies.userId, session.user.id), eq(schema.doProxies.status, 'failed')))
      .returning({ id: schema.doProxies.id })

    logActivity({ action: 'cloud_mass_delete_proxy', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { count: result.length } }).catch(() => {})

    return NextResponse.json({ success: true, deleted: result.length })
  }

  // Single delete
  const { id } = body
  await db
    .delete(schema.doProxies)
    .where(and(eq(schema.doProxies.id, id), eq(schema.doProxies.userId, session.user.id)))

  logActivity({ action: 'cloud_delete_proxy', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { id } }).catch(() => {})

  return NextResponse.json({ success: true })
}
