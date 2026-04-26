import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'
import { deductBalance, addBalance } from '@/lib/db/operations'
import { checkRateLimit } from '@/lib/rate-limit'

import { doFetch } from '@/lib/do-fetch'

// GET: List droplets from DO account
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await doFetch(session.user.id, account.token, 'GET', '/droplets?per_page=100') as any
    return NextResponse.json({ success: true, data: data.droplets || [] })
  } catch (e: any) {
    notifyError('/api/cloud/droplets', e.message || String(e))
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: Create droplet
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 3 requests per minute per user
  const { allowed } = checkRateLimit(`droplets:${session.user.id}`, 3, 60000)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })
  }

  const { account_id, name, region, size, image, install_rdp, vps_password, rdp_password, windows_version, rdp_type } = await request.json()

  // Validate passwords
  const pw = install_rdp ? rdp_password : vps_password
  if (pw) {
    if (pw.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (pw.length > 72) return NextResponse.json({ error: 'Password must be at most 72 characters' }, { status: 400 })
  }
  
  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, account_id), eq(schema.doAccounts.userId, session.user.id)))
    .limit(1)

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Deduct balance BEFORE creating VPS when install_rdp is enabled
  let installPrice = 0
  let balanceDeducted = false
  if (install_rdp) {
    const [priceSettings] = await db
      .select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, 'install_price'))
      .limit(1)
    installPrice = typeof priceSettings?.value === 'object'
      ? ((priceSettings.value as Record<string, number>).amount || 1000)
      : (parseInt(priceSettings?.value as string) || 1000)

    const deductResult = await deductBalance(session.user.id, installPrice)
    if (!deductResult) {
      return NextResponse.json({ error: 'Insufficient balance for RDP installation' }, { status: 400 })
    }
    balanceDeducted = true
  }

  try {
    // Server-side limit check before creating
    const accountInfo = await doFetch(session.user.id, account.token, 'GET', '/account') as { account?: { droplet_limit?: number; droplet_count?: number } }
    const dropletLimit = accountInfo?.account?.droplet_limit || 0
    const dropletCount = accountInfo?.account?.droplet_count || 0
    if (dropletCount >= dropletLimit) {
      // Refund if balance was deducted
      if (balanceDeducted) await addBalance(session.user.id, installPrice)
      return NextResponse.json(
        { error: 'Droplet limit reached. Delete existing droplets or contact DigitalOcean to increase your limit.' },
        { status: 400 }
      )
    }

    // When install_rdp is enabled, use rdp_password as VPS root password (bundling)
    const rootPassword = install_rdp ? rdp_password : vps_password

    // Sanitize password for cloud-init YAML injection prevention
    const YAML_UNSAFE = /["`$\\|;&(){}\n\r:]/
    if (rootPassword && YAML_UNSAFE.test(rootPassword)) {
      return NextResponse.json({ success: false, error: 'Password contains invalid characters' }, { status: 400 })
    }

    const userData = rootPassword ? [
      '#cloud-config',
      'chpasswd:',
      '  list: |',
      `    root:${rootPassword}`,
      '  expire: false',
      'ssh_pwauth: true',
    ].join('\n') : undefined

    // Sanitize hostname: only a-z, A-Z, 0-9, . and -
    const sanitizedName = (name || `cobain-${Date.now()}`).replace(/[^a-zA-Z0-9.\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `cobain-${Date.now()}`

    const data: any = await doFetch(session.user.id, account.token, 'POST', '/droplets', {
      name: sanitizedName,
      region: region || 'sgp1',
      size: size || 's-2vcpu-4gb',
      image: image || 'ubuntu-22-04-x64',
      backups: false,
      ...(userData ? { user_data: userData } : {}),
    })
    
    // Track droplet + save RDP intent if enabled
    await db.insert(schema.doDroplets).values({
      userId: session.user.id,
      accountId: account_id,
      dropletId: data.droplet?.id,
      name: data.droplet?.name,
      region: data.droplet?.region?.slug,
      size: data.droplet?.size_slug,
      image: data.droplet?.image?.slug,
      status: data.droplet?.status,
      // RDP intent — backend will auto-trigger install when VPS is ready
      ...(install_rdp ? {
        pendingRdp: true,
        rdpPassword: rdp_password,
        windowsVersion: windows_version,
        rdpType: rdp_type || 'dedicated',
        rdpStatus: 'pending_ip',
      } : {}),
    })

    // Log activity
    logActivity({ action: install_rdp ? 'cloud_create_vps_rdp' : 'cloud_create_vps', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { name: data.droplet?.name, region, size, droplet_id: data.droplet?.id } }).catch(() => {})

    return NextResponse.json({ success: true, data: data.droplet, payment_deducted: balanceDeducted })
  } catch (e: any) {
    // Refund if balance was deducted but VPS creation failed
    if (balanceDeducted) await addBalance(session.user.id, installPrice)
    notifyError('/api/cloud/droplets', e.message || String(e))
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT: Rename droplet
export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_id, droplet_id, name } = await request.json()
  if (!name || !name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, account_id), eq(schema.doAccounts.userId, session.user.id)))
    .limit(1)

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  try {
    // DO API uses POST to actions endpoint for rename (not PUT)
    const data: any = await doFetch(session.user.id, account.token, 'POST', `/droplets/${droplet_id}/actions`, { type: 'rename', name: name.trim() })
    await db
      .update(schema.doDroplets)
      .set({ name: name.trim() })
      .where(and(eq(schema.doDroplets.dropletId, droplet_id), eq(schema.doDroplets.userId, session.user.id)))

    logActivity({ action: 'cloud_droplet_rename', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { droplet_id, name: name.trim() } }).catch(() => {})

    return NextResponse.json({ success: true, data: data.action })
  } catch (e: any) {
    notifyError('/api/cloud/droplets', e.message || String(e))
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE: Delete droplet
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_id, droplet_id } = await request.json()
  
  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, account_id), eq(schema.doAccounts.userId, session.user.id)))
    .limit(1)

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  try {
    await doFetch(session.user.id, account.token, 'DELETE', `/droplets/${droplet_id}`)
    await db
      .delete(schema.doDroplets)
      .where(and(eq(schema.doDroplets.dropletId, droplet_id), eq(schema.doDroplets.userId, session.user.id)))

    // Log activity
    logActivity({ action: 'cloud_delete_vps', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { droplet_id } }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (e: any) {
    notifyError('/api/cloud/droplets', e.message || String(e))
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
