'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Loader2, DollarSign, Monitor, ShieldAlert, Check, X,
  AlertTriangle, Power, Bell, Gift, Lock,
} from 'lucide-react'

interface MaintenanceConfig {
  enabled: boolean
  scope: string[]
  note: string
  show_popup: boolean
}

/* ─── Helpers ─── */
function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

export default function AdminSettingsPage() {
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'super_admin'
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  // Install Price
  const [installPrice, setInstallPrice] = useState('1000')
  const [installPriceLoaded, setInstallPriceLoaded] = useState(false)

  // Free Credit
  const [freeCredit, setFreeCredit] = useState({ enabled: false, amount: 0 })

  // Maintenance
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>({
    enabled: false,
    scope: [],
    note: '',
    show_popup: false,
  })
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false)

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Load settings
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings')
      if (res.ok) {
        const json = await res.json()
        if (json.data?.install_price) {
          setInstallPrice(String(json.data.install_price))
        }
        if (json.data?.free_credit) {
          const fc = json.data.free_credit
          setFreeCredit(typeof fc === 'object' ? fc : { enabled: false, amount: 0 })
        }
        if (json.data?.maintenance) {
          const m = typeof json.data.maintenance === 'string'
            ? JSON.parse(json.data.maintenance)
            : json.data.maintenance
          const rawScope = m.scope
          const normalizedScope = Array.isArray(rawScope) ? rawScope : (rawScope === 'none' || !rawScope ? [] : [rawScope])
          setMaintenance({
            enabled: m.enabled ?? false,
            scope: normalizedScope,
            note: m.note ?? '',
            show_popup: m.show_popup ?? false,
          })
        }
      }
    } catch { /* silent */ }
    setInstallPriceLoaded(true)
    setMaintenanceLoaded(true)
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  /* ─── Save Install Price ─── */
  const handleSaveInstallPrice = async () => {
    try {
      setLoading('install_price')
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'install_price', value: parseInt(installPrice) }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setToast({ type: 'success', text: `Install price set to Rp ${formatNumber(parseInt(installPrice))}` })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setLoading(null)
    }
  }

  /* ─── Save Free Credit ─── */
  const handleSaveFreeCredit = async () => {
    try {
      setLoading('free_credit')
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'free_credit', value: freeCredit }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setToast({ type: 'success', text: 'Free credit settings saved' })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setLoading(null)
    }
  }

  /* ─── Save Maintenance ─── */
  const handleSaveMaintenance = async () => {
    try {
      setLoading('maintenance')
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'maintenance', value: maintenance }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setToast({ type: 'success', text: 'Maintenance settings saved' })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setLoading(null)
    }
  }

  const toggleScope = (scope: string) => {
    setMaintenance(prev => {
      const currentScope = Array.isArray(prev.scope) ? prev.scope : []
      if (scope === 'all') {
        return { ...prev, scope: currentScope.includes('all') ? [] : ['all'] }
      }
      const filtered = currentScope.filter(s => s !== 'all')
      return {
        ...prev,
        scope: filtered.includes(scope)
          ? filtered.filter(s => s !== scope)
          : [...filtered, scope],
      }
    })
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-5xl">
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <Lock className="size-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-lg font-semibold text-white">Super Admin Only</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Settings require super admin privileges.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Configure pricing, OS versions, and maintenance mode
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            background: toast.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(244,63,94,0.1)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(244,63,94,0.2)'}`,
            color: toast.type === 'success' ? '#4ade80' : '#fb7185',
          }}
        >
          {toast.type === 'success' ? <Check className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ─── A) Install Price ─── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(0,245,212,0.08)' }}>
            <DollarSign className="size-4" style={{ color: 'var(--q-accent)' }} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-white">Install Price</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Price per RDP installation (IDR)</p>
          </div>
        </div>
        <div className="p-3 lg:p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Price (IDR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>Rp</span>
                <input
                  type="number"
                  value={installPrice}
                  onChange={(e) => setInstallPrice(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,212,0.3)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                  disabled={!installPriceLoaded}
                />
              </div>
            </div>
            <button
              onClick={handleSaveInstallPrice}
              disabled={loading === 'install_price' || !installPrice}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
              style={{ background: 'var(--q-accent)', color: '#0a0a0a' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {loading === 'install_price' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save
            </button>
          </div>
          {installPriceLoaded && installPrice && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Current: Rp {formatNumber(parseInt(installPrice))} per install
            </p>
          )}
        </div>
      </div>

      {/* ─── New User Bonus ─── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(0,245,212,0.08)' }}>
            <Gift className="size-4" style={{ color: 'var(--q-accent)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-medium text-white">New User Bonus</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Give free credit to new registrations</p>
          </div>
          {/* Toggle */}
          <button
            onClick={() => setFreeCredit(prev => ({ ...prev, enabled: !prev.enabled }))}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none"
            style={{
              background: freeCredit.enabled ? 'var(--q-accent)' : 'var(--surface-3)',
            }}
          >
            <span
              className="inline-block size-4 rounded-full transition-transform duration-200"
              style={{
                background: freeCredit.enabled ? '#0a0a0a' : 'var(--text-muted)',
                transform: freeCredit.enabled ? 'translateX(22px)' : 'translateX(4px)',
              }}
            />
          </button>
        </div>
        <div className="p-3 lg:p-4">
          {freeCredit.enabled && (
            <div className="flex items-end gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Amount (IDR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>Rp</span>
                  <input
                    type="number"
                    value={freeCredit.amount}
                    onChange={e => setFreeCredit(prev => ({ ...prev, amount: parseInt(e.target.value) || 0 }))}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,212,0.3)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                  />
                </div>
              </div>
              <button
                onClick={handleSaveFreeCredit}
                disabled={loading === 'free_credit'}
                className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
                style={{ background: 'var(--q-accent)', color: '#0a0a0a' }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                {loading === 'free_credit' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save
              </button>
            </div>
          )}
          {!freeCredit.enabled && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <Gift className="size-4" style={{ color: 'var(--text-muted)' }} />
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Enable to give new users a welcome bonus on registration
              </div>
            </div>
          )}
          {freeCredit.enabled && freeCredit.amount > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              New users will receive Rp {formatNumber(freeCredit.amount)} on registration
            </p>
          )}
        </div>
      </div>

      {/* ─── B) OS Versions Link ─── */}
      <div className="rounded-xl p-4 lg:p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
              <Monitor className="size-4" style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">OS Versions</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Manage available Windows versions</p>
            </div>
          </div>
          <a href="/admin/os-versions" className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-85" style={{ background: 'var(--q-accent)', color: '#000' }}>
            Manage →
          </a>
        </div>
      </div>

      {/* ─── C) Maintenance Mode ─── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.08)' }}>
            <ShieldAlert className="size-4" style={{ color: 'var(--amber)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-medium text-white">Maintenance Mode</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Temporarily disable services for maintenance</p>
          </div>
          {/* Main toggle */}
          <button
            onClick={() => setMaintenance(prev => ({ ...prev, enabled: !prev.enabled }))}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none"
            style={{
              background: maintenance.enabled ? 'var(--amber)' : 'var(--surface-3)',
            }}
          >
            <span
              className="inline-block size-4 rounded-full transition-transform duration-200"
              style={{
                background: maintenance.enabled ? '#0a0a0a' : 'var(--text-muted)',
                transform: maintenance.enabled ? 'translateX(22px)' : 'translateX(4px)',
              }}
            />
          </button>
        </div>

        <div className="p-3 lg:p-4 space-y-3 lg:space-y-4">
          {/* Status indicator */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
            <Power className="size-4" style={{ color: maintenance.enabled ? 'var(--amber)' : 'var(--green)' }} />
            <div className="flex-1">
              <div className="text-xs font-medium" style={{ color: maintenance.enabled ? 'var(--amber)' : 'var(--green)' }}>
                {maintenance.enabled ? 'Maintenance Active' : 'System Online'}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {maintenance.enabled
                  ? `Scope: ${(Array.isArray(maintenance.scope) ? maintenance.scope : []).length ? (Array.isArray(maintenance.scope) ? maintenance.scope : []).join(', ') : 'none selected'}`
                  : 'All services running normally'}
              </div>
            </div>
            {!maintenanceLoaded && <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--text-muted)' }} />}
          </div>

          {/* Scope checkboxes */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Scope</label>
            <div className="flex flex-wrap gap-2">
              {['install', 'topup', 'all'].map((scope) => {
                const isActive = (Array.isArray(maintenance.scope) ? maintenance.scope : []).includes(scope)
                return (
                  <button
                    key={scope}
                    onClick={() => toggleScope(scope)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize"
                    style={{
                      background: isActive ? 'rgba(245,158,11,0.1)' : 'var(--surface-2)',
                      border: `1px solid ${isActive ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'}`,
                      color: isActive ? 'var(--amber)' : 'var(--text-muted)',
                    }}
                  >
                    {scope}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Note textarea */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Admin Note</label>
            <textarea
              value={maintenance.note}
              onChange={(e) => setMaintenance(prev => ({ ...prev, note: e.target.value }))}
              placeholder="Maintenance message for users..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all resize-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
            />
          </div>

          {/* Show Popup toggle */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-3">
              <Bell className="size-4" style={{ color: 'var(--text-muted)' }} />
              <div>
                <div className="text-sm text-white">Show Popup</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Display maintenance popup to users</div>
              </div>
            </div>
            <button
              onClick={() => setMaintenance(prev => ({ ...prev, show_popup: !prev.show_popup }))}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none"
              style={{
                background: maintenance.show_popup ? 'var(--q-accent)' : 'var(--surface-3)',
              }}
            >
              <span
                className="inline-block size-4 rounded-full transition-transform duration-200"
                style={{
                  background: maintenance.show_popup ? '#0a0a0a' : 'var(--text-muted)',
                  transform: maintenance.show_popup ? 'translateX(22px)' : 'translateX(4px)',
                }}
              />
            </button>
          </div>

          {/* Save */}
          <button
            onClick={handleSaveMaintenance}
            disabled={loading === 'maintenance'}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'var(--amber)', color: '#0a0a0a' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {loading === 'maintenance' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {loading === 'maintenance' ? 'Saving...' : 'Save Maintenance Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
