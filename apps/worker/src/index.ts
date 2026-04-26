import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  ATLANTIC_API_KEY: string
  UBUNTU_WEBHOOK_URL: string
  UBUNTU_API_KEY: string
  WORKER_API_SECRET: string
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Secret'],
}))

// Health
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'cobaindev-rdp-worker',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  })
})

// Poll payments - check pending transactions with Atlantic
app.post('/api/poll-payments', async (c) => {
  const secret = c.req.header('X-Api-Secret')
  if (secret !== c.env.WORKER_API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY)

  // Get pending transactions with payment tracking
  const { data: pendingTxs } = await supabase
    .from('transactions')
    .select('*, payment_tracking(*)')
    .eq('status', 'pending')
    .limit(50)

  let processed = 0, approved = 0, expired = 0

  for (const tx of (pendingTxs || [])) {
    const tracking = Array.isArray(tx.payment_tracking) ? tx.payment_tracking[0] : tx.payment_tracking
    if (!tracking?.atlantic_payment_id) continue

    // Check if expired
    if (tracking.expires_at && new Date(tracking.expires_at) < new Date()) {
      await supabase.from('transactions').update({ status: 'expired' }).eq('id', tx.id)
      expired++
      processed++
      continue
    }

    // Check Atlantic status
    try {
      const statusForm = new URLSearchParams({
        api_key: c.env.ATLANTIC_API_KEY,
        id: tracking.atlantic_payment_id
      })
      const statusRes = await fetch('https://atlantich2h.com/deposit/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: statusForm.toString()
      })
      const statusData = await statusRes.json() as any

      const paymentStatus = statusData.data?.status?.toLowerCase()

      // Update poll count
      await supabase.from('payment_tracking').update({ poll_count: (tracking.poll_count || 0) + 1 }).eq('id', tracking.id)

      if (['success', 'processing'].includes(paymentStatus || '')) {
        // Use atomic RPC
        await supabase.rpc('complete_payment', {
          p_transaction_id: tx.id,
          p_user_id: tx.user_id,
          p_amount: tx.amount
        })
        approved++
      } else if (['expired', 'cancel', 'cancelled'].includes(paymentStatus || '')) {
        await supabase.from('transactions').update({ status: paymentStatus === 'cancel' ? 'cancelled' : paymentStatus }).eq('id', tx.id)
        expired++
      }

      processed++
    } catch (e) {
      // Skip this transaction
    }
  }

  return c.json({ success: true, processed, approved, expired })
})

// Trigger installation
app.post('/api/trigger-install', async (c) => {
  const secret = c.req.header('X-Api-Secret')
  if (secret !== c.env.WORKER_API_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json()
  const { installation_id, vps_ip, root_password, windows_version, rdp_password, rdp_type } = body

  try {
    const triggerRes = await fetch(`${c.env.UBUNTU_WEBHOOK_URL}/api/trigger-rdp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': c.env.UBUNTU_API_KEY
      },
      body: JSON.stringify({ installation_id, vps_ip, root_password, windows_version, rdp_password, rdp_type })
    })

    const triggerData = await triggerRes.json()
    return c.json(triggerData, triggerRes.status as any)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default app
