import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'
import { doFetch } from '@/lib/do-fetch'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_id, droplet_id, action, image } = await request.json()
  // action: 'reboot', 'power_off', 'power_on', 'shutdown', 'password_reset', 'rebuild'
  
  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, account_id), eq(schema.doAccounts.userId, session.user.id)))
    .limit(1)

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const validActions = ['reboot', 'power_off', 'power_on', 'shutdown', 'password_reset', 'rebuild', 'enable_ipv6']
  if (!validActions.includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  try {
    const data: any = await doFetch(session.user.id, account.token, 'POST', `/droplets/${droplet_id}/actions`, { type: action, ...(action === 'rebuild' && image ? { image } : {}) })

    // Log activity
    logActivity({ action: 'cloud_droplet_' + action, userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { droplet_id, action } }).catch(() => {})

    return NextResponse.json({ success: true, data: data.action })
  } catch (e: any) {
    notifyError('/api/cloud/droplets/actions', e.message || String(e))
    return NextResponse.json({ error: e.name === 'DOApiError' ? e.message : 'Cloud service error' }, { status: 500 })
  }
}
