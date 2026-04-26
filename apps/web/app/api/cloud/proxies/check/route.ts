import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { checkProxyConnectivity } from '@/lib/do-fetch'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { proxy_id, check_all } = await request.json()

  // Get a DO token to test against
  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(eq(schema.doAccounts.userId, session.user.id))
    .limit(1)

  if (!account) {
    return NextResponse.json({ error: 'Add a DigitalOcean account first to test proxies' }, { status: 400 })
  }

  // Single check
  if (proxy_id) {
    const [proxy] = await db
      .select()
      .from(schema.doProxies)
      .where(and(eq(schema.doProxies.id, proxy_id), eq(schema.doProxies.userId, session.user.id)))
      .limit(1)

    if (!proxy) return NextResponse.json({ error: 'Proxy not found' }, { status: 404 })

    const result = await checkProxyConnectivity(proxy, account.token)

    await db
      .update(schema.doProxies)
      .set({ status: result.status, lastChecked: new Date(), responseTime: result.responseTime })
      .where(eq(schema.doProxies.id, proxy_id))

    return NextResponse.json({ success: true, result: { id: proxy_id, ...result } })
  }

  // Check all
  if (check_all) {
    const proxies = await db
      .select()
      .from(schema.doProxies)
      .where(eq(schema.doProxies.userId, session.user.id))

    const results: Array<{ id: string; status: string; responseTime: number; error?: string }> = []

    // Check sequentially with concurrency limit of 3
    for (let i = 0; i < proxies.length; i += 3) {
      const batch = proxies.slice(i, i + 3)
      const batchResults = await Promise.all(
        batch.map(async (proxy) => {
          const result = await checkProxyConnectivity(proxy, account.token)
          await db
            .update(schema.doProxies)
            .set({ status: result.status, lastChecked: new Date(), responseTime: result.responseTime })
            .where(eq(schema.doProxies.id, proxy.id))
          return { id: proxy.id, ...result }
        })
      )
      results.push(...batchResults)
    }

    return NextResponse.json({ success: true, results })
  }

  return NextResponse.json({ error: 'Specify proxy_id or check_all' }, { status: 400 })
}
