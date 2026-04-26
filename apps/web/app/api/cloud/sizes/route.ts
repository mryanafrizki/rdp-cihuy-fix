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
  const region = request.nextUrl.searchParams.get('region')
  if (!accountId) return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, accountId), eq(schema.doAccounts.userId, session.user.id)))
    .limit(1)

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, accountInfo] = await Promise.all([
      doFetch(session.user.id, account.token, 'GET', '/sizes?per_page=200') as Promise<any>,
      doFetch(session.user.id, account.token, 'GET', '/account').catch(() => null) as Promise<any>,
    ])

    const dropletLimit = accountInfo?.account?.droplet_limit || 0
    const dropletCount = accountInfo?.account?.droplet_count || 0

    let sizes = (data.sizes || []).filter((s: any) => s.available)

    // Filter by region - STRICT: only show sizes whose regions array includes this region
    if (region) {
      const regionLower = region.toLowerCase()
      sizes = sizes.filter((s: any) => {
        const regions: string[] = s.regions || []
        return regions.some((r: string) => r.toLowerCase() === regionLower)
      })
    }

    // Filter out sizes the account likely can't create (GPU, premium tiers requiring verification)
    const ALLOWED_PREFIXES = ['s-', 'c-', 'c2-', 'g-', 'gd-', 'm-', 'm3-', 'm6-', 'so-', 'so1_5-']
    sizes = sizes.filter((s: any) => {
      const slug: string = s.slug || ''
      return ALLOWED_PREFIXES.some(prefix => slug.startsWith(prefix))
    })

    // Group by type
    const grouped: Record<string, any[]> = {
      'Basic Regular': [],
      'Premium Intel': [],
      'Premium AMD': [],
      'General Purpose': [],
      'CPU-Optimized': [],
      'Memory-Optimized': [],
      'Storage-Optimized': [],
      'Other': [],
    }

    sizes.forEach((s: any) => {
      const slug: string = s.slug || ''
      const desc: string = (s.description || '').toLowerCase()

      const formatted = {
        slug: s.slug,
        vcpus: s.vcpus,
        memory: s.memory,
        memoryGB: Math.round(s.memory / 1024),
        disk: s.disk,
        price_monthly: s.price_monthly,
        price_hourly: s.price_hourly,
        transfer: s.transfer,
        description: s.description || '',
        available: s.available,
        regions: s.regions || [],
      }

      // Categorize by slug suffix and prefix
      if (slug.endsWith('-amd') || desc.includes('amd')) {
        grouped['Premium AMD'].push(formatted)
      } else if (slug.endsWith('-intel') || desc.includes('intel')) {
        grouped['Premium Intel'].push(formatted)
      } else if (slug.startsWith('s-')) {
        grouped['Basic Regular'].push(formatted)
      } else if (slug.startsWith('g-') || slug.startsWith('gd-')) {
        grouped['General Purpose'].push(formatted)
      } else if (slug.startsWith('c-') || slug.startsWith('c2-')) {
        grouped['CPU-Optimized'].push(formatted)
      } else if (slug.startsWith('m-') || slug.startsWith('m3-') || slug.startsWith('m6-')) {
        grouped['Memory-Optimized'].push(formatted)
      } else if (slug.startsWith('so-') || slug.startsWith('so1_5-')) {
        grouped['Storage-Optimized'].push(formatted)
      } else {
        grouped['Other'].push(formatted)
      }
    })

    // Remove empty groups
    Object.keys(grouped).forEach(k => { if (grouped[k].length === 0) delete grouped[k] })

    return NextResponse.json({
      success: true,
      data: grouped,
      limits: {
        droplet_limit: dropletLimit,
        droplet_count: dropletCount,
        remaining: dropletLimit - dropletCount,
      }
    })
  } catch (e: any) {
    notifyError('/api/cloud/sizes', e.message || String(e))
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
