import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'
import { doFetch } from '@/lib/do-fetch'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = request.nextUrl.searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, accountId), eq(schema.doAccounts.userId, session.user.id)))
    .limit(1)

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  try {
    const [balance, accountInfo] = await Promise.all([
      doFetch(session.user.id, account.token, 'GET', '/customers/my/balance').catch(() => null) as Promise<any>,
      doFetch(session.user.id, account.token, 'GET', '/account').catch(() => null) as Promise<any>,
    ])

    // Update cached balance
    await db
      .update(schema.doAccounts)
      .set({
        balance: String(parseFloat(balance?.month_to_date_balance || '0')),
        dropletLimit: accountInfo?.account?.droplet_limit || 0,
        lastChecked: new Date(),
      })
      .where(eq(schema.doAccounts.id, accountId))

    return NextResponse.json({
      success: true,
      data: {
        balance: {
          month_to_date_balance: balance?.month_to_date_balance || '0',
          account_balance: balance?.account_balance || '0',
          month_to_date_usage: balance?.month_to_date_usage || '0',
          generated_at: balance?.generated_at,
        },
        account: accountInfo?.account,
      }
    })
  } catch (e: any) {
    notifyError('/api/cloud/balance', e.message || String(e))
    return NextResponse.json({ error: e.name === 'DOApiError' ? e.message : 'Cloud service error' }, { status: 500 })
  }
}
