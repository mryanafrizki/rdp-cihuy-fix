import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'
import { doFetch } from '@/lib/do-fetch'
import { signRequest } from '@/lib/hmac-sign'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { account_id, droplet_id, new_password, current_password } = await request.json()
  if (!new_password || new_password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  if (new_password.length > 72) return NextResponse.json({ error: 'Password must be at most 72 characters' }, { status: 400 })
  if (!current_password) return NextResponse.json({ error: 'Current root password required' }, { status: 400 })

  const [account] = await db
    .select({ token: schema.doAccounts.token })
    .from(schema.doAccounts)
    .where(and(eq(schema.doAccounts.id, account_id), eq(schema.doAccounts.userId, session.user.id)))
    .limit(1)

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  try {
    // Get droplet IP from DO API (through proxy)
    const doData: any = await doFetch(session.user.id, account.token, 'GET', `/droplets/${droplet_id}`)
    const dropletIp = doData.droplet?.networks?.v4?.find((n: any) => n.type === 'public')?.ip_address
    if (!dropletIp) throw new Error('Could not find droplet public IP')

    // Use ubuntu-service to SSH in and change password
    const ubuntuServiceUrl = process.env.UBUNTU_SERVICE_URL
    if (!ubuntuServiceUrl) throw new Error('UBUNTU_SERVICE_URL not configured')

    // Sanitize password to prevent shell command injection
    const SHELL_UNSAFE = /["`'$\\|;&(){}\n\r]/
    if (SHELL_UNSAFE.test(new_password)) {
      return NextResponse.json({ success: false, error: 'Password contains invalid characters' }, { status: 400 })
    }
    const ubuntuApiKey = process.env.UBUNTU_API_KEY
    if (!ubuntuApiKey) throw new Error('Ubuntu service not configured')

    const execBody = JSON.stringify({
      vps_ip: dropletIp,
      root_password: current_password,
      command: `echo "root:${new_password}" | chpasswd && echo "PASSWORD_CHANGED_OK"`
    });
    const { timestamp: execTs, signature: execSig } = signRequest(execBody, ubuntuApiKey);
    const sshRes = await fetch(`${ubuntuServiceUrl}/api/exec-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': ubuntuApiKey, 'X-Timestamp': execTs, 'X-Signature': execSig },
      body: execBody
    })

    const result = await sshRes.json()
    if (!result.success) throw new Error(result.error || 'Failed to change password via SSH')

    logActivity({ action: 'cloud_droplet_set_password', userId: session.user.id, email: session.user.email || '', ...getRequestInfo(request), details: { droplet_id } }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (e: any) {
    notifyError('/api/cloud/droplets/password', e.message || String(e))
    return NextResponse.json({ error: e.name === 'DOApiError' ? e.message : 'Cloud service error' }, { status: 500 })
  }
}
