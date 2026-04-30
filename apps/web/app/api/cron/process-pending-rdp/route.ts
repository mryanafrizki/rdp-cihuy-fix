import { db, schema } from '@/lib/db'
import { eq, and, isNotNull } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { doFetch } from '@/lib/do-fetch'
import { addBalance } from '@/lib/db/operations'
import { signRequest } from '@/lib/hmac-sign'
import { notifyNewOrder } from '@/lib/telegram-notify'
import { auth } from '@/lib/auth-config'

/**
 * Process pending RDP installations for newly created droplets.
 * Called by: cron job (x-cron-secret), ubuntu-service (x-api-key), or authenticated user (session).
 *
 * Flow per pending droplet:
 *   pending_ip → poll DO for IP → pending_active
 *   pending_active → poll DO for status=active → pending_ssh
 *   pending_ssh → test SSH via ubuntu-service → triggering
 *   triggering → POST /api/orders (skip_payment) → triggered
 *
 * On failure at any step after 20 minutes: mark failed + refund.
 */
export async function POST(request: NextRequest) {
  // Authenticate: CRON_SECRET, UBUNTU_API_KEY, or logged-in user session
  const cronSecret = request.headers.get('x-cron-secret')
  const apiKey = request.headers.get('x-api-key')
  const ubuntuApiKey = process.env.UBUNTU_API_KEY
  const validCron = cronSecret && cronSecret === process.env.CRON_SECRET
  const validApiKey = apiKey && ubuntuApiKey && apiKey === ubuntuApiKey

  let validSession = false
  if (!validCron && !validApiKey) {
    const session = await auth()
    validSession = !!session?.user?.id
  }

  if (!validCron && !validApiKey && !validSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pending = await db
    .select()
    .from(schema.doDroplets)
    .where(and(
      eq(schema.doDroplets.pendingRdp, true),
      isNotNull(schema.doDroplets.rdpStatus),
    ))

  if (pending.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  const results: { dropletId: number; status: string; error?: string }[] = []
  const ubuntuServiceUrl = process.env.UBUNTU_SERVICE_URL
  const ubuntuKey = process.env.UBUNTU_API_KEY

  for (const droplet of pending) {
    const status = droplet.rdpStatus
    const createdAt = droplet.createdAt ? new Date(droplet.createdAt).getTime() : Date.now()
    const ageMinutes = (Date.now() - createdAt) / 60000

    // Timeout: if pending for >20 minutes, mark failed + refund
    if (ageMinutes > 20 && status !== 'triggered') {
      await db.update(schema.doDroplets)
        .set({ rdpStatus: 'failed', pendingRdp: false })
        .where(eq(schema.doDroplets.id, droplet.id))

      // Refund balance
      if (droplet.userId) {
        const [priceSettings] = await db
          .select({ value: schema.appSettings.value })
          .from(schema.appSettings)
          .where(eq(schema.appSettings.key, 'install_price'))
          .limit(1)
        const price = typeof priceSettings?.value === 'object'
          ? ((priceSettings.value as Record<string, number>).amount || 1000)
          : (parseInt(priceSettings?.value as string) || 1000)
        await addBalance(droplet.userId, price)
      }

      results.push({ dropletId: droplet.dropletId, status: 'failed', error: 'Timeout after 20 minutes' })
      continue
    }

    try {
      // Get DO account token
      if (!droplet.accountId) { results.push({ dropletId: droplet.dropletId, status: 'skip', error: 'No account' }); continue }
      const [account] = await db
        .select({ token: schema.doAccounts.token })
        .from(schema.doAccounts)
        .where(eq(schema.doAccounts.id, droplet.accountId))
        .limit(1)
      if (!account) { results.push({ dropletId: droplet.dropletId, status: 'skip', error: 'Account not found' }); continue }

      if (status === 'pending_ip') {
        // Poll DO for IP
        const doData = await doFetch(droplet.userId, account.token, 'GET', `/droplets/${droplet.dropletId}`) as any
        const networks = doData?.droplet?.networks?.v4 || []
        const pubIp = networks.find((n: any) => n.type === 'public')?.ip_address
        if (pubIp) {
          await db.update(schema.doDroplets)
            .set({ ipAddress: pubIp, rdpStatus: 'pending_active' })
            .where(eq(schema.doDroplets.id, droplet.id))
          results.push({ dropletId: droplet.dropletId, status: 'pending_active' })
        } else {
          results.push({ dropletId: droplet.dropletId, status: 'pending_ip' })
        }
      } else if (status === 'pending_active') {
        // Poll DO for status=active
        const doData = await doFetch(droplet.userId, account.token, 'GET', `/droplets/${droplet.dropletId}`) as any
        const ip = doData?.droplet?.networks?.v4?.find((n: any) => n.type === 'public')?.ip_address || droplet.ipAddress
        if (doData?.droplet?.status === 'active' && ip) {
          await db.update(schema.doDroplets)
            .set({ ipAddress: ip, rdpStatus: 'pending_ssh', status: 'active' })
            .where(eq(schema.doDroplets.id, droplet.id))
          results.push({ dropletId: droplet.dropletId, status: 'pending_ssh' })
        } else {
          results.push({ dropletId: droplet.dropletId, status: 'pending_active' })
        }
      } else if (status === 'pending_ssh') {
        // Test SSH via ubuntu-service
        if (!ubuntuServiceUrl || !droplet.ipAddress || !droplet.rdpPassword) {
          results.push({ dropletId: droplet.dropletId, status: 'pending_ssh', error: 'Missing config' })
          continue
        }
        try {
          const checkBody = JSON.stringify({ vps_ip: droplet.ipAddress, root_password: droplet.rdpPassword });
          const checkSig = signRequest(checkBody, ubuntuKey || '');
          const checkRes = await fetch(`${ubuntuServiceUrl}/api/check-vps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ubuntuKey || '', 'x-timestamp': checkSig.timestamp, 'x-signature': checkSig.signature },
            body: checkBody,
            signal: AbortSignal.timeout(15000),
          })
          const checkJson = await checkRes.json()
          if (checkJson.success || checkJson.connected) {
            await db.update(schema.doDroplets)
              .set({ rdpStatus: 'triggering' })
              .where(eq(schema.doDroplets.id, droplet.id))
            results.push({ dropletId: droplet.dropletId, status: 'triggering' })
          } else {
            results.push({ dropletId: droplet.dropletId, status: 'pending_ssh' })
          }
        } catch {
          results.push({ dropletId: droplet.dropletId, status: 'pending_ssh', error: 'SSH not ready' })
        }
      } else if (status === 'triggering') {
        // Trigger RDP install via ubuntu-service
        if (!ubuntuServiceUrl || !droplet.ipAddress || !droplet.rdpPassword || !droplet.windowsVersion) {
          results.push({ dropletId: droplet.dropletId, status: 'triggering', error: 'Missing config' })
          continue
        }

        // Re-verify SSH is still reachable before triggering
        try {
          const recheckBody = JSON.stringify({ vps_ip: droplet.ipAddress, root_password: droplet.rdpPassword });
          const recheckSig = signRequest(recheckBody, ubuntuKey || '');
          const recheck = await fetch(`${ubuntuServiceUrl}/api/check-vps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ubuntuKey || '', 'x-timestamp': recheckSig.timestamp, 'x-signature': recheckSig.signature },
            body: recheckBody,
            signal: AbortSignal.timeout(10000),
          })
          const recheckJson = await recheck.json()
          if (!recheckJson.success && !recheckJson.connected) {
            // SSH not ready yet, go back to pending_ssh
            await db.update(schema.doDroplets)
              .set({ rdpStatus: 'pending_ssh' })
              .where(eq(schema.doDroplets.id, droplet.id))
            results.push({ dropletId: droplet.dropletId, status: 'pending_ssh', error: 'SSH lost, retrying' })
            continue
          }
        } catch {
          await db.update(schema.doDroplets)
            .set({ rdpStatus: 'pending_ssh' })
            .where(eq(schema.doDroplets.id, droplet.id))
          results.push({ dropletId: droplet.dropletId, status: 'pending_ssh', error: 'SSH check failed, retrying' })
          continue
        }

        // Create installation record + trigger
        const installId = `rdp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const rdpType = droplet.rdpType || 'dedicated'

        // Create installation
        const [installation] = await db.insert(schema.installations).values({
          userId: droplet.userId,
          installId,
          vpsIp: droplet.ipAddress,
          windowsVersion: droplet.windowsVersion,
          rdpType: rdpType as 'dedicated' | 'docker',
          status: 'pending',
          rdpPassword: droplet.rdpPassword,
        }).returning({ id: schema.installations.id })

        if (!installation) {
          results.push({ dropletId: droplet.dropletId, status: 'triggering', error: 'Failed to create installation' })
          continue
        }

        // Create deduction transaction
        const [priceSettings] = await db
          .select({ value: schema.appSettings.value })
          .from(schema.appSettings)
          .where(eq(schema.appSettings.key, 'install_price'))
          .limit(1)
        const price = typeof priceSettings?.value === 'object'
          ? ((priceSettings.value as Record<string, number>).amount || 1000)
          : (parseInt(priceSettings?.value as string) || 1000)

        await db.insert(schema.transactions).values({
          userId: droplet.userId,
          amount: String(-price),
          type: 'deduction',
          status: 'completed',
          paymentId: `install_${installation.id}`,
        })

        // Trigger ubuntu-service
        try {
          const trigBody = JSON.stringify({
              installation_id: installation.id,
              vps_ip: droplet.ipAddress,
              root_password: droplet.rdpPassword,
              windows_version: droplet.windowsVersion,
              rdp_password: droplet.rdpPassword,
              rdp_type: rdpType,
            });
          const trigSig = signRequest(trigBody, ubuntuKey || '');
          const triggerRes = await fetch(`${ubuntuServiceUrl}/api/trigger-rdp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ubuntuKey || '', 'x-timestamp': trigSig.timestamp, 'x-signature': trigSig.signature },
            body: trigBody,
            signal: AbortSignal.timeout(15000),
          })
          if (triggerRes.ok) {
            await db.update(schema.doDroplets)
              .set({ rdpStatus: 'triggered', pendingRdp: false })
              .where(eq(schema.doDroplets.id, droplet.id))
            // Telegram notification
            const [user] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, droplet.userId)).limit(1)
            try { notifyNewOrder(user?.email || 'unknown', droplet.ipAddress || '', droplet.windowsVersion || '') } catch {}
            results.push({ dropletId: droplet.dropletId, status: 'triggered' })
          } else {
            results.push({ dropletId: droplet.dropletId, status: 'triggering', error: 'Trigger failed' })
          }
        } catch (e: any) {
          results.push({ dropletId: droplet.dropletId, status: 'triggering', error: 'trigger failed' })
        }
      } else if (status === 'triggered') {
        // Already done, mark as not pending
        await db.update(schema.doDroplets)
          .set({ pendingRdp: false })
          .where(eq(schema.doDroplets.id, droplet.id))
        results.push({ dropletId: droplet.dropletId, status: 'done' })
      }
    } catch (e: any) {
      results.push({ dropletId: droplet.dropletId, status: 'error', error: 'processing failed' })
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results })
}
