'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Zap, ArrowRight, Loader2 } from 'lucide-react'
import { showToast } from '@/components/ui/toast-notification'
import { Turnstile } from '@marsidev/react-turnstile'

const PRESETS = [10000, 25000, 50000, 100000, 250000, 500000]

function formatRp(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID')
}

export default function TopUpPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')

  // Show success toast when returning from payment
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      showToast('✓ Top up successful! Balance updated.', 'success');
      window.history.replaceState({}, '', '/dashboard/topup');
    }
  }, []);

  const amount = selected || (parseInt(custom) || 0)

  const handlePay = async () => {
    if (amount < 1000) { setError('Minimum Rp 1.000'); return }
    setLoading(true); setError('')
    try {
      // Check maintenance before proceeding
      const mRes = await fetch('/api/maintenance')
      const mData = await mRes.json()
      if (mData.data?.enabled) {
        const scope = Array.isArray(mData.data.scope) ? mData.data.scope : [mData.data.scope]
        if (scope.includes('topup') || scope.includes('all')) {
          setError('Top-up is currently under maintenance')
          setLoading(false)
          return
        }
      }
      const res = await fetch('/api/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, turnstileToken })
      })
      const data = await res.json()
      if (data.success) {
        router.push(`/pay/${data.data.transaction_id}`)
      } else {
        setError(data.error || 'Gagal membuat pembayaran')
        setLoading(false)
      }
    } catch {
      setError('Network error')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto py-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Top Up Balance</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted, #55566a)' }}>Pilih nominal untuk top up saldo</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="mt-8 rounded-2xl p-6"
        style={{ background: 'var(--surface-1, #111113)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
        
        {/* Preset amounts */}
        <div className="grid grid-cols-3 gap-3">
          {PRESETS.map(val => (
            <motion.button key={val} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setSelected(val); setCustom('') }}
              className="py-4 rounded-xl text-center transition-all"
              style={{
                background: selected === val ? 'var(--q-accent, #00f5d4)' : 'var(--surface-2, #1a1a1f)',
                color: selected === val ? '#000' : 'var(--text-secondary, #8a8b9e)',
                border: `1px solid ${selected === val ? 'transparent' : 'var(--border-subtle, rgba(255,255,255,0.06))'}`,
                fontWeight: selected === val ? 600 : 400,
              }}>
              <div className="text-lg font-semibold">{formatRp(val)}</div>
            </motion.button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="mt-4 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted, #55566a)' }}>Rp</span>
          <input type="number" value={custom} placeholder="Custom amount"
            onChange={e => { setCustom(e.target.value); setSelected(null) }}
            className="w-full pl-10 pr-4 py-3.5 rounded-xl text-white placeholder:text-[var(--text-muted,#55566a)] focus:outline-none focus:ring-2 focus:ring-[var(--q-accent,#00f5d4)]/40"
            style={{ background: 'var(--surface-2, #1a1a1f)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }} />
        </div>

        {/* Nominal display */}
        {amount > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-5 text-center py-3 rounded-xl"
            style={{ background: 'var(--surface-2, #1a1a1f)' }}>
            <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted, #55566a)' }}>Nominal top up</div>
            <div className="text-2xl font-bold text-white mt-1">{formatRp(amount)}</div>
          </motion.div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--rose, #f43f5e)' }}>
            {error}
          </div>
        )}

        {/* Turnstile captcha */}
        {amount >= 1000 && (
          <div className="mt-5 flex justify-center">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken('')}
              onExpire={() => setTurnstileToken('')}
              options={{ theme: 'dark', size: 'normal' }}
            />
          </div>
        )}

        {/* Pay button */}
        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
          onClick={handlePay} disabled={loading || amount < 1000 || !turnstileToken}
          className="mt-6 w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          style={{ background: loading ? 'var(--surface-3, #222228)' : 'var(--q-accent, #00f5d4)', color: loading ? 'var(--text-secondary)' : '#000' }}>
          {loading ? <><Loader2 className="size-5 animate-spin" /> Memproses...</> : <><Zap className="size-5" /> Bayar via QRIS <ArrowRight className="size-5" /></>}
        </motion.button>
      </motion.div>
    </div>
  )
}
