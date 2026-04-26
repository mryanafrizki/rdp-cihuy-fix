import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'
import { toSnake } from '@/lib/utils'
import { doFetch } from '@/lib/do-fetch'
import { checkRateLimit } from '@/lib/rate-limit'

// GET: List user's DO accounts
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await db
    .select()
    .from(schema.doAccounts)
    .where(eq(schema.doAccounts.userId, session.user.id))
    .orderBy(desc(schema.doAccounts.createdAt))

  return NextResponse.json({ success: true, data: data.map(d => toSnake(d as Record<string, unknown>)) })
}

// POST: Add DO account (validate token with DO API)
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 5 requests per minute per user
  const { allowed } = checkRateLimit(`accounts:${session.user.id}`, 5, 60000)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })
  }

  const { token, proxy } = await request.json()
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  // Validate token with DO API (uses user's proxy settings)
  try {
    const accountData: any = await doFetch(session.user.id, token, 'GET', '/account').catch(() => null)
    if (!accountData?.account) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    
    const balanceData: any = await doFetch(session.user.id, token, 'GET', '/customers/my/balance').catch(() => null)

    // Check if token already exists
    const [existing] = await db
      .select({ id: schema.doAccounts.id })
      .from(schema.doAccounts)
      .where(and(eq(schema.doAccounts.userId, session.user.id), eq(schema.doAccounts.token, token)))
      .limit(1)

    if (existing) return NextResponse.json({ error: 'Account already added' }, { status: 400 })

    const [data] = await db
      .insert(schema.doAccounts)
      .values({
        userId: session.user.id,
        token,
        email: accountData.account?.email || '',
        status: accountData.account?.status || 'active',
        balance: String(parseFloat(balanceData?.month_to_date_balance || '0')),
        dropletLimit: accountData.account?.droplet_limit || 0,
        lastChecked: new Date(),
      })
      .returning()

    // Log activity
    logActivity({ action: 'cloud_add_account', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { email: accountData.account?.email } }).catch(() => {})

    return NextResponse.json({ success: true, data: toSnake(data as Record<string, unknown>) })
  } catch (e: any) {
    notifyError('/api/cloud/accounts', e.message || String(e))
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE: Remove DO account
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  await db
    .delete(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, id), eq(schema.doAccounts.userId, session.user.id)))

  // Log activity
  logActivity({ action: 'cloud_delete_account', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { id } }).catch(() => {})

  return NextResponse.json({ success: true })
}
