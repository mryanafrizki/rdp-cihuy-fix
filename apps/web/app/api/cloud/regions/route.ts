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
    const data: any = await doFetch(session.user.id, account.token, 'GET', '/regions?per_page=100')
    const regions = (data.regions || [])
      .filter((r: any) => r.available)
      .map((r: any) => ({
        slug: r.slug,
        name: r.name,
        available: r.available,
      }))

    return NextResponse.json({ success: true, data: regions })
  } catch (e: any) {
    notifyError('/api/cloud/regions', e.message || String(e))
    return NextResponse.json({ error: e.name === 'DOApiError' ? e.message : 'Cloud service error' }, { status: 500 })
  }
}
