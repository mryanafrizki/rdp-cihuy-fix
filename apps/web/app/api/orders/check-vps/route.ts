import { auth } from '@/lib/auth-config'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { signRequest } from '@/lib/hmac-sign'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  // Rate limit: 10 requests per minute per user
  const { allowed } = checkRateLimit(`check-vps:${userId}`, 10, 60000)
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please wait.' }, { status: 429 })
  }

  const { vps_ip, root_password, skip_freeze } = await request.json()

  // SSRF protection: block private/internal IP ranges
  const isPrivateIP = (ip: string): boolean => {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some(p => isNaN(p))) return true
    if (parts[0] === 10) return true // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true // 192.168.0.0/16
    if (parts[0] === 127) return true // 127.0.0.0/8
    if (parts[0] === 0) return true // 0.0.0.0/8
    if (ip === '168.144.34.139' || ip === '139.59.56.240') return true // Our own servers
    return false
  }

  if (isPrivateIP(vps_ip)) {
    return NextResponse.json({ success: false, error: 'Private/internal IP addresses are not allowed' }, { status: 400 })
  }

  // Fetch install price
  const [priceSettings] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'install_price'))
    .limit(1)
  const price = typeof priceSettings?.value === 'object' ? ((priceSettings.value as Record<string, number>).amount || 1000) : (parseInt(priceSettings?.value as string) || 1000)

  // Check balance
  const [userData] = await db
    .select({
      creditBalance: schema.users.creditBalance,
      failCount: schema.users.failCount,
      frozenUntil: schema.users.frozenUntil,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  const creditBalance = Number(userData?.creditBalance ?? 0)

  if (!userData || creditBalance < price) {
    return NextResponse.json({ 
      success: false, 
      error: `Insufficient balance. You need Rp ${price.toLocaleString('id-ID')} to install RDP. Current balance: Rp ${creditBalance.toLocaleString('id-ID')}` 
    }, { status: 400 })
  }

  if (userData?.frozenUntil && new Date(userData.frozenUntil) > new Date()) {
    const remaining = Math.ceil(
      (new Date(userData.frozenUntil).getTime() - Date.now()) / 60000
    )
    return NextResponse.json(
      {
        success: false,
        error: `Account frozen for ${remaining} more minute(s) due to repeated failures. Please try again later.`,
      },
      { status: 429 }
    )
  }

  // Call ubuntu-service to check VPS specs
  const ubuntuUrl = process.env.UBUNTU_SERVICE_URL
  const ubuntuKey = process.env.UBUNTU_API_KEY

  if (!ubuntuUrl) {
    return NextResponse.json({ success: false, error: 'Installation service not configured' }, { status: 500 })
  }

  try {
    const checkBody = JSON.stringify({ vps_ip, root_password })
    const { timestamp, signature } = signRequest(checkBody, ubuntuKey || '')

    const checkRes = await fetch(`${ubuntuUrl}/api/check-vps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ubuntuKey || '',
        'x-timestamp': timestamp,
        'x-signature': signature,
      },
      body: checkBody,
    })

    const checkData = await checkRes.json()

    if (!checkData.success) {
      // Skip fail count for automated cloud-create polling
      if (!skip_freeze) {
        const newFailCount = (userData?.failCount || 0) + 1
        const updates: Record<string, unknown> = { failCount: newFailCount }

        // Freeze after 5 consecutive failures
        if (newFailCount >= 5) {
          updates.frozenUntil = new Date(
            Date.now() + 5 * 60 * 1000
          ) // 5 min freeze
          updates.failCount = 0 // Reset count after freeze
        }

        await db
          .update(schema.users)
          .set(updates)
          .where(eq(schema.users.id, userId))
      }

      return NextResponse.json({
        success: false,
        error: checkData.error || 'VPS check failed',
        specs: checkData.specs,
      })
    }

    // Reset fail count on success
    await db
      .update(schema.users)
      .set({ failCount: 0, frozenUntil: null })
      .where(eq(schema.users.id, userId))

    return NextResponse.json({
      success: true,
      specs: checkData.specs,
    })
  } catch (e: unknown) {
    // Skip fail count for automated cloud-create polling
    if (!skip_freeze) {
      const newFailCount = (userData?.failCount || 0) + 1
      const updates: Record<string, unknown> = { failCount: newFailCount }
      if (newFailCount >= 5) {
        updates.frozenUntil = new Date(Date.now() + 5 * 60 * 1000)
        updates.failCount = 0
      }
      await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, userId))
    }

    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({
      success: false,
      error: `Connection failed: ${message}`,
    })
  }
}
