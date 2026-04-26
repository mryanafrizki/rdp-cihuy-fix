'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { showToast } from '@/components/ui/toast-notification'
import {
  Cloud, Key, Shield, Server, Plus, Trash2, RefreshCw, Power,
  RotateCcw, Loader2, Check, Copy, Globe, ChevronDown, Radio,
  Lock, Eye, EyeOff, Pencil, HardDrive, KeyRound, AlertTriangle, Wifi, WifiOff
} from 'lucide-react'

type Tab = 'accounts' | 'proxies' | 'droplets'

/* ─── Shared helpers ─── */

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-gray-600 hover:text-gray-400 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function maskToken(token: string) {
  if (!token) return ''
  if (token.length <= 12) return token.slice(0, 4) + '****'
  return token.slice(0, 8) + '****' + token.slice(-4)
}

function MaskedToken({ token }: { token: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const masked = token.length > 10 ? token.substring(0, 10) + '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : maskToken(token)

  const copyToken = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <code className="text-xs px-2 py-1 rounded font-mono truncate max-w-[280px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        {revealed ? token : masked}
      </code>
      <button
        onClick={() => setRevealed(!revealed)}
        className="text-xs px-2 py-1 rounded transition-colors hover:brightness-125 shrink-0"
        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
      >
        {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
      <button
        onClick={copyToken}
        className="text-xs px-2 py-1 rounded transition-colors shrink-0"
        style={{ background: copied ? 'rgba(34,197,94,0.2)' : 'var(--surface-2)', color: copied ? '#22c55e' : 'var(--text-muted)' }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  new: 'bg-blue-500/10 text-blue-400',
  off: 'bg-gray-500/10 text-gray-400',
  archive: 'bg-amber-500/10 text-amber-400',
}

const DROPLET_STATUS: Record<string, { color: string; dot: string }> = {
  active: { color: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-400' },
  new: { color: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-400 animate-pulse' },
  off: { color: 'bg-gray-500/10 text-gray-400', dot: 'bg-gray-400' },
}

// Docker OS versions — separate list (uses dockur/windows via rdp.sh)
const DOCKER_OS_VERSIONS = [
  { id: 'docker_win11_pro', name: 'Windows 11 Pro', category: 'docker_desktop' },
  { id: 'docker_win11_ltsc', name: 'Windows 11 LTSC', category: 'docker_desktop' },
  { id: 'docker_win11_ent', name: 'Windows 11 Enterprise', category: 'docker_desktop' },
  { id: 'docker_win10_pro', name: 'Windows 10 Pro', category: 'docker_desktop' },
  { id: 'docker_win10_ltsc', name: 'Windows 10 LTSC', category: 'docker_desktop' },
  { id: 'docker_win10_ent', name: 'Windows 10 Enterprise', category: 'docker_desktop' },
  { id: 'docker_win81_ent', name: 'Windows 8.1 Enterprise', category: 'docker_desktop' },
  { id: 'docker_win7', name: 'Windows 7 Ultimate', category: 'docker_desktop' },
  { id: 'docker_vista', name: 'Windows Vista Ultimate', category: 'docker_desktop' },
  { id: 'docker_xp', name: 'Windows XP Professional', category: 'docker_desktop' },
  { id: 'docker_2000', name: 'Windows 2000 Professional', category: 'docker_desktop' },
  { id: 'docker_srv2025', name: 'Windows Server 2025', category: 'docker_server' },
  { id: 'docker_srv2022', name: 'Windows Server 2022', category: 'docker_server' },
  { id: 'docker_srv2019', name: 'Windows Server 2019', category: 'docker_server' },
  { id: 'docker_srv2016', name: 'Windows Server 2016', category: 'docker_server' },
  { id: 'docker_srv2012', name: 'Windows Server 2012', category: 'docker_server' },
  { id: 'docker_srv2008', name: 'Windows Server 2008', category: 'docker_server' },
  { id: 'docker_srv2003', name: 'Windows Server 2003', category: 'docker_server' },
  // Lightweight / Custom
  { id: 'docker_tiny11', name: 'Tiny11 (Lightweight Win11)', category: 'docker_lite' },
]

const DO_REGIONS = [
  { slug: 'sgp1', name: 'Singapore 1' },
  { slug: 'sfo3', name: 'San Francisco 3' },
  { slug: 'nyc3', name: 'New York 3' },
  { slug: 'ams3', name: 'Amsterdam 3' },
  { slug: 'lon1', name: 'London 1' },
  { slug: 'fra1', name: 'Frankfurt 1' },
  { slug: 'blr1', name: 'Bangalore 1' },
  { slug: 'syd1', name: 'Sydney 1' },
]

const DO_SIZES = [
  { slug: 's-1vcpu-1gb', name: '1 vCPU / 1 GB' },
  { slug: 's-1vcpu-2gb', name: '1 vCPU / 2 GB' },
  { slug: 's-2vcpu-2gb', name: '2 vCPU / 2 GB' },
  { slug: 's-2vcpu-4gb', name: '2 vCPU / 4 GB' },
  { slug: 's-4vcpu-8gb', name: '4 vCPU / 8 GB' },
  { slug: 's-8vcpu-16gb', name: '8 vCPU / 16 GB' },
]

const DO_IMAGES = [
  { slug: 'ubuntu-22-04-x64', name: 'Ubuntu 22.04 x64' },
  { slug: 'ubuntu-24-04-x64', name: 'Ubuntu 24.04 x64' },
  { slug: 'debian-12-x64', name: 'Debian 12 x64' },
  { slug: 'centos-stream-9-x64', name: 'CentOS Stream 9 x64' },
]

/* ─── Confirm Dialog ─── */

type ConfirmState = {
  open: boolean
  title: string
  message: string
  content?: React.ReactNode
  confirmText: string
  variant: 'danger' | 'warning' | 'default'
  onConfirm: () => void
}

function ConfirmDialog({
  open, onClose, onConfirm, title, message, content, confirmText, variant,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  content?: React.ReactNode
  confirmText?: string
  variant?: 'danger' | 'warning' | 'default'
}) {
  if (!open) return null

  const colors = {
    danger: { bg: 'var(--rose)', text: '#fff' },
    warning: { bg: 'var(--amber)', text: '#000' },
    default: { bg: 'var(--q-accent)', text: '#000' },
  }
  const c = colors[variant || 'default']

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full rounded-2xl p-6" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {content ? (
          <div className="mt-3">{content}</div>
        ) : (
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        )}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
            Cancel
          </button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: c.bg, color: c.text }}>
            {confirmText || 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

/* ─── Input Dialog ─── */

type InputDialogState = {
  open: boolean
  title: string
  message: string
  confirmText: string
  variant: 'danger' | 'warning' | 'default'
  fields: InputField[]
  onConfirm: (values: Record<string, string>) => void
}

type InputField = {
  key: string
  label: string
  type?: 'text' | 'password' | 'select'
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string; group?: string }[]
}

function InputDialog({
  open, onClose, onConfirm, title, message, confirmText, variant, fields, loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (values: Record<string, string>) => void
  title: string
  message: string
  confirmText?: string
  variant?: 'danger' | 'warning' | 'default'
  fields: InputField[]
  loading?: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {}
      fields.forEach(f => { init[f.key] = '' })
      setValues(init)
      setShowPasswords({})
    }
  }, [open, fields])

  if (!open) return null

  const colors = {
    danger: { bg: 'var(--rose)', text: '#fff' },
    warning: { bg: 'var(--amber)', text: '#000' },
    default: { bg: 'var(--q-accent)', text: '#000' },
  }
  const c = colors[variant || 'default']
  const allRequired = fields.filter(f => f.required !== false).every(f => values[f.key]?.trim())

  // Group options by group for select fields
  const groupedOptions = (options: InputField['options']) => {
    if (!options) return {}
    const groups: Record<string, { value: string; label: string }[]> = {}
    options.forEach(o => {
      const g = o.group || ''
      if (!groups[g]) groups[g] = []
      groups[g].push(o)
    })
    return groups
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="max-w-sm w-full rounded-2xl p-6" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        <div className="mt-4 space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
              {f.type === 'select' ? (
                <select
                  value={values[f.key] || ''}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  <option value="">{f.placeholder || 'Select...'}</option>
                  {(() => {
                    const groups = groupedOptions(f.options)
                    const groupKeys = Object.keys(groups)
                    if (groupKeys.length === 1 && groupKeys[0] === '') {
                      return groups[''].map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                    }
                    return groupKeys.map(g => (
                      g ? (
                        <optgroup key={g} label={g}>
                          {groups[g].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      ) : groups[g].map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                    ))
                  })()}
                </select>
              ) : (
                <div className="relative">
                  <input
                    type={f.type === 'password' && !showPasswords[f.key] ? 'password' : 'text'}
                    value={values[f.key] || ''}
                    onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none pr-10"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                  />
                  {f.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => setShowPasswords(p => ({ ...p, [f.key]: !p[f.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {showPasswords[f.key] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
            Cancel
          </button>
          <button
            onClick={() => { if (allRequired) onConfirm(values) }}
            disabled={!allRequired || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: c.bg, color: c.text }}
          >
            {loading ? <><Loader2 className="size-3.5 animate-spin" /> Processing...</> : confirmText || 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function useConfirmDialog() {
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const showConfirm = (opts: {
    title: string
    message: string
    content?: React.ReactNode
    confirmText?: string
    variant?: 'danger' | 'warning' | 'default'
    onConfirm: () => void
  }) => {
    setConfirm({
      open: true,
      title: opts.title,
      message: opts.message,
      content: opts.content,
      confirmText: opts.confirmText || 'Confirm',
      variant: opts.variant || 'default',
      onConfirm: opts.onConfirm,
    })
  }

  const closeConfirm = () => setConfirm(null)

  return { confirm, showConfirm, closeConfirm }
}

/* ─── Accounts Tab ─── */

interface DOAccount {
  id: string
  token: string
  email: string
  status: string
  balance: number
  droplet_limit: number
  droplet_count?: number
  last_checked: string
  created_at: string
}

function AccountsTab() {
  const [accounts, setAccounts] = useState<DOAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { confirm, showConfirm, closeConfirm } = useConfirmDialog()

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/cloud/accounts')
      const json = await res.json()
      if (json.success) {
        const accs: DOAccount[] = json.data || []
        setAccounts(accs)
        // Auto-fetch droplet counts for all accounts with retry
        const fetchDropletCount = async (accId: string, retries = 3) => {
          for (let i = 0; i < retries; i++) {
            try {
              const r = await fetch(`/api/cloud/balance?account_id=${accId}`)
              const d = await r.json()
              const doAcc = d.data?.account
              if (doAcc && typeof doAcc.droplet_count === 'number') {
                setAccounts(prev => prev.map(a => a.id === accId ? { ...a, droplet_count: doAcc.droplet_count } : a))
                return
              }
            } catch { /* retry */ }
            if (i < retries - 1) await new Promise(r => setTimeout(r, 2000))
          }
        }
        accs.forEach(acc => fetchDropletCount(acc.id))
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const addAccount = async () => {
    if (!tokenInput.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/cloud/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add account')
      showToast('Account added successfully', 'success')
      setTokenInput('')
      setShowAdd(false)
      fetchAccounts()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setAdding(false) }
  }

  const refreshBalance = async (id: string) => {
    setRefreshingId(id)
    try {
      const res = await fetch(`/api/cloud/balance?account_id=${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to refresh')
      showToast('Balance refreshed', 'success')
      await fetchAccounts()
      // Update droplet_count from DO API response (not stored in DB)
      const doAccount = json.data?.account
      if (doAccount && typeof doAccount.droplet_count === 'number') {
        setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, droplet_count: doAccount.droplet_count } : acc))
      }
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setRefreshingId(null) }
  }

  const deleteAccount = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch('/api/cloud/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      showToast('Account removed', 'success')
      fetchAccounts()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setDeletingId(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-gray-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add Account */}
      {showAdd ? (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-sm font-medium text-white">Add DigitalOcean Account</div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>API Token</label>
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="dop_v1_..."
              disabled={adding}
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-all disabled:opacity-50"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              onFocus={e => e.target.style.borderColor = 'var(--q-accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Token will be validated against the DigitalOcean API</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAdd(false); setTokenInput('') }}
              disabled={adding}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={addAccount}
              disabled={adding || !tokenInput.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'var(--q-accent)', color: '#000' }}
            >
              {adding ? <><Loader2 className="size-3.5 animate-spin" /> Validating...</> : 'Add Account'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110"
          style={{ background: 'var(--q-accent)', color: '#000' }}
        >
          <Plus className="size-4" />
          Add Account
        </button>
      )}

      {/* Account List */}
      {accounts.length === 0 ? (
        <div className="rounded-xl py-16 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <Key className="size-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No accounts added yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add a DigitalOcean API token to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => (
            <div
              key={acc.id}
              className="rounded-xl p-4 transition-colors hover:brightness-105"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{acc.email || 'Unknown'}</span>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide', STATUS_COLORS[acc.status] || STATUS_COLORS.active)}>
                      {acc.status}
                    </span>
                  </div>
                  <MaskedToken token={acc.token} />
                  <div className="grid grid-cols-3 gap-3 mt-1 text-xs">
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Credit</span>
                      <div className="text-white font-medium">${Math.abs(parseFloat(String(acc.balance || '0'))).toFixed(2)}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Droplet Limit</span>
                      <div className="text-white font-medium">{acc.droplet_limit}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Last Checked</span>
                      <div className="text-white font-medium">
                        {acc.last_checked
                          ? new Date(acc.last_checked).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : '--'}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => refreshBalance(acc.id)}
                    disabled={refreshingId === acc.id}
                    className="p-2 rounded-lg transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                    title="Refresh balance"
                  >
                    <RefreshCw className={cn('size-4', refreshingId === acc.id && 'animate-spin')} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                  <button
                    onClick={() => showConfirm({
                      title: 'Delete Account',
                      message: 'Remove this DigitalOcean account? This will not affect your droplets on DigitalOcean.',
                      confirmText: 'Delete',
                      variant: 'danger',
                      onConfirm: () => deleteAccount(acc.id),
                    })}
                    disabled={deletingId === acc.id}
                    className="p-2 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    title="Remove account"
                  >
                    {deletingId === acc.id
                      ? <Loader2 className="size-4 animate-spin text-red-400" />
                      : <Trash2 className="size-4 text-red-400/60 hover:text-red-400" />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open={confirm.open}
          onClose={closeConfirm}
          onConfirm={confirm.onConfirm}
          title={confirm.title}
          message={confirm.message}
          content={confirm.content}
          confirmText={confirm.confirmText}
          variant={confirm.variant}
        />
      )}
    </div>
  )
}

/* ─── Proxies Tab ─── */

interface Proxy {
  id: string
  protocol: string
  host: string
  port: number
  username?: string
  password?: string
  label?: string
  is_selected: boolean
  status: string
  last_checked: string | null
  response_time: number | null
  created_at: string
}

function ProxiesTab() {
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [proxyMode, setProxyMode] = useState<'disabled' | 'manual' | 'rotate'>('disabled')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showMassAdd, setShowMassAdd] = useState(false)
  const [massAddText, setMassAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [form, setForm] = useState({ protocol: 'http', host: '', port: '', username: '', password: '', label: '' })
  const { confirm, showConfirm, closeConfirm } = useConfirmDialog()

  const fetchProxies = useCallback(async () => {
    try {
      const res = await fetch('/api/cloud/proxies')
      const json = await res.json()
      if (json.success) {
        setProxies(json.data || [])
        if (json.proxyMode) setProxyMode(json.proxyMode)
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProxies() }, [fetchProxies])

  const addProxy = async () => {
    if (!form.host || !form.port) return
    setAdding(true)
    try {
      const res = await fetch('/api/cloud/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, port: parseInt(form.port) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add proxy')
      showToast('Proxy added', 'success')
      setForm({ protocol: 'http', host: '', port: '', username: '', password: '', label: '' })
      setShowAdd(false)
      fetchProxies()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setAdding(false) }
  }

  const massAddProxies = async () => {
    if (!massAddText.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/cloud/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxies: massAddText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add proxies')
      showToast(`Added ${json.added} proxies${json.skipped ? `, ${json.skipped} skipped (limit)` : ''}${json.errors?.length ? `, ${json.errors.length} invalid` : ''}`, 'success')
      setMassAddText('')
      setShowMassAdd(false)
      fetchProxies()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setAdding(false) }
  }

  const changeMode = async (mode: 'disabled' | 'manual' | 'rotate') => {
    try {
      await fetch('/api/cloud/proxies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_mode', mode }),
      })
      setProxyMode(mode)
      if (mode === 'rotate') fetchProxies() // refresh to clear selections
    } catch { /* silent */ }
  }

  const checkSingle = async (id: string) => {
    setCheckingId(id)
    try {
      const res = await fetch('/api/cloud/proxies/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy_id: id }),
      })
      const json = await res.json()
      if (json.success && json.result) {
        setProxies(prev => prev.map(p => p.id === id ? { ...p, status: json.result.status, response_time: json.result.responseTime, last_checked: new Date().toISOString() } : p))
        showToast(json.result.status === 'active' ? `Proxy OK (${json.result.responseTime}ms)` : `Proxy failed: ${json.result.error}`, json.result.status === 'active' ? 'success' : 'error')
      }
    } catch { showToast('Check failed', 'error') }
    finally { setCheckingId(null) }
  }

  const checkAll = async () => {
    setCheckingAll(true)
    try {
      const res = await fetch('/api/cloud/proxies/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_all: true }),
      })
      const json = await res.json()
      if (json.success && json.results) {
        const resultMap = new Map(json.results.map((r: { id: string; status: string; responseTime: number }) => [r.id, r]))
        setProxies(prev => prev.map(p => {
          const r = resultMap.get(p.id) as { status: string; responseTime: number } | undefined
          return r ? { ...p, status: r.status, response_time: r.responseTime, last_checked: new Date().toISOString() } : p
        }))
        const active = json.results.filter((r: { status: string }) => r.status === 'active').length
        showToast(`Checked ${json.results.length} proxies: ${active} active, ${json.results.length - active} failed`, 'info')
      }
    } catch { showToast('Check failed', 'error') }
    finally { setCheckingAll(false) }
  }

  const deleteFailed = async () => {
    try {
      const res = await fetch('/api/cloud/proxies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_failed' }),
      })
      const json = await res.json()
      if (json.success) {
        showToast(`Deleted ${json.deleted} failed proxies`, 'success')
        fetchProxies()
      }
    } catch { showToast('Delete failed', 'error') }
  }

  const selectProxy = async (id: string, isSelected: boolean) => {
    setSelectingId(id)
    try {
      await fetch('/api/cloud/proxies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: isSelected ? null : id, is_selected: !isSelected }),
      })
      fetchProxies()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setSelectingId(null) }
  }

  const deleteProxy = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch('/api/cloud/proxies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      showToast('Proxy removed', 'success')
      fetchProxies()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setDeletingId(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-gray-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Mode + Stats Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Mode:</span>
          <select
            value={proxyMode}
            onChange={e => {
              const next = e.target.value as 'disabled' | 'manual' | 'rotate'
              if (next === proxyMode) return
              showConfirm({
                title: 'Change Proxy Mode',
                message: next === 'disabled'
                  ? 'Switch to direct connection? All DO API requests will use your server IP.'
                  : next === 'manual'
                  ? 'Switch to manual mode? Select one proxy to route all DO API requests through.'
                  : 'Switch to auto-rotate? DO API requests will cycle through all active proxies.',
                confirmText: 'Switch',
                variant: 'default',
                onConfirm: () => changeMode(next),
              })
              e.target.value = proxyMode // revert until confirmed
            }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none appearance-none cursor-pointer"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', color: proxyMode === 'disabled' ? 'var(--text-muted)' : proxyMode === 'manual' ? 'var(--q-accent)' : '#a855f7' }}
          >
            <option value="disabled">Disabled</option>
            <option value="manual">Manual Select</option>
            <option value="rotate">Auto Rotate</option>
          </select>
        </div>
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {proxies.length}/30 proxies{proxies.filter(p => p.status === 'active').length > 0 && <> &middot; <span className="text-emerald-400">{proxies.filter(p => p.status === 'active').length} active</span></>}
        </span>
      </div>

      {proxyMode === 'disabled' && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', color: 'var(--amber)' }}>
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>Using server IP directly. Consider enabling a proxy to protect your IP from rate limits.</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        {proxies.length < 30 && (
          <>
            <button onClick={() => { setShowAdd(true); setShowMassAdd(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors hover:brightness-110"
              style={{ background: 'var(--q-accent)', color: '#000' }}>
              <Plus className="size-3" /> Add
            </button>
            <button onClick={() => { setShowMassAdd(true); setShowAdd(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              <Plus className="size-3" /> Mass Add
            </button>
          </>
        )}
        {proxies.length > 0 && (
          <button
            onClick={() => showConfirm({ title: 'Check All Proxies', message: `Test connectivity for all ${proxies.length} proxies? This may take a moment.`, confirmText: 'Check All', variant: 'default', onConfirm: checkAll })}
            disabled={checkingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40 transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
            {checkingAll ? <Loader2 className="size-3 animate-spin" /> : <Wifi className="size-3" />} Check All
          </button>
        )}
        {proxies.some(p => p.status === 'failed') && (
          <button
            onClick={() => showConfirm({ title: 'Delete Failed Proxies', message: `Remove ${proxies.filter(p => p.status === 'failed').length} failed proxy(s)?`, confirmText: 'Delete', variant: 'danger', onConfirm: deleteFailed })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{ background: 'rgba(244,63,94,0.06)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.12)' }}>
            <Trash2 className="size-3" /> Delete Failed
          </button>
        )}
      </div>

      {/* Add Proxy Form */}
      {showAdd && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-sm font-medium text-white">Add Proxy</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Protocol</label>
              <select
                value={form.protocol}
                onChange={e => setForm(f => ({ ...f, protocol: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Label</label>
              <input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Optional"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Host</label>
              <input
                value={form.host}
                onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                placeholder="proxy.example.com"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Port</label>
              <input
                value={form.port}
                onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                placeholder="8080"
                type="number"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Username</label>
              <input
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Optional"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Password</label>
              <input
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Optional"
                type="password"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAdd(false); setForm({ protocol: 'http', host: '', port: '', username: '', password: '', label: '' }) }}
              disabled={adding}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => showConfirm({ title: 'Add Proxy', message: `Add ${form.protocol}://${form.host}:${form.port}?`, confirmText: 'Add', variant: 'default', onConfirm: addProxy })}
              disabled={adding || !form.host || !form.port}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'var(--q-accent)', color: '#000' }}
            >
              {adding ? <><Loader2 className="size-3.5 animate-spin" /> Adding...</> : 'Add Proxy'}
            </button>
          </div>
        </div>
      )}

      {/* Mass Add Form */}
      {showMassAdd && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-sm font-medium text-white">Mass Add Proxies</div>
          <textarea
            value={massAddText}
            onChange={e => setMassAddText(e.target.value)}
            placeholder={'http://host:port\nsocks5://user:pass@host:port\nhttp://user:pass@host:port'}
            rows={6}
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none font-mono resize-y"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
          />
          <div className="flex gap-2">
            <button onClick={() => { setShowMassAdd(false); setMassAddText('') }} disabled={adding} className="px-3 py-1.5 rounded-lg text-sm cursor-pointer" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button onClick={() => {
              const lines = massAddText.trim().split('\n').filter(l => l.trim()).length
              showConfirm({ title: 'Mass Add Proxies', message: `Parse and add ${lines} proxy line(s)?`, confirmText: 'Add All', variant: 'default', onConfirm: massAddProxies })
            }} disabled={adding || !massAddText.trim()} className="px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2" style={{ background: 'var(--q-accent)', color: '#000' }}>
              {adding ? <><Loader2 className="size-3.5 animate-spin" /> Adding...</> : 'Add Proxies'}
            </button>
          </div>
        </div>
      )}

      {/* Proxy List */}
      {proxies.length === 0 ? (
        <div className="rounded-xl py-16 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <Globe className="size-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No proxies configured</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add a proxy for DigitalOcean API requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {proxies.map(proxy => (
            <div
              key={proxy.id}
              className="rounded-xl p-4 transition-colors"
              style={{
                background: proxy.is_selected ? 'rgba(0, 245, 212, 0.04)' : 'var(--surface-1)',
                border: proxy.is_selected ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Radio button - only in manual mode */}
                  {proxyMode === 'manual' && (
                    <button
                      onClick={() => selectProxy(proxy.id, proxy.is_selected)}
                      disabled={selectingId === proxy.id}
                      className="shrink-0 transition-colors disabled:opacity-50"
                      title={proxy.is_selected ? 'Deselect' : 'Select as active'}
                    >
                      <div className="size-4 rounded-full border-2 flex items-center justify-center transition-all"
                        style={{ borderColor: proxy.is_selected ? 'var(--q-accent)' : 'var(--text-muted)', background: proxy.is_selected ? 'var(--q-accent)' : 'transparent' }}>
                        {proxy.is_selected && <div className="size-1.5 rounded-full bg-black" />}
                      </div>
                    </button>
                  )}
                  {/* Status dot */}
                  <div className={`size-2.5 rounded-full shrink-0 ${proxy.status === 'active' ? 'bg-emerald-400 animate-pulse' : proxy.status === 'failed' ? 'bg-red-400' : 'bg-gray-500'}`} title={proxy.status} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {proxy.label && <span className="text-sm font-medium text-white">{proxy.label}</span>}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-blue-500/10 text-blue-400">
                        {proxy.protocol}
                      </span>
                      {proxy.is_selected && proxyMode === 'manual' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide" style={{ background: 'var(--accent-glow)', color: 'var(--q-accent)' }}>Active</span>
                      )}
                      {proxy.response_time != null && proxy.status === 'active' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{proxy.response_time}ms</span>
                      )}
                    </div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {proxy.host}:{proxy.port}
                      {proxy.username && <span style={{ color: 'var(--text-muted)' }}> (auth)</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => showConfirm({ title: 'Check Proxy', message: `Test connectivity for ${proxy.host}:${proxy.port}?`, confirmText: 'Check', variant: 'default', onConfirm: () => checkSingle(proxy.id) })} disabled={checkingId === proxy.id}
                    className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50" title="Check proxy">
                    {checkingId === proxy.id ? <Loader2 className="size-3.5 animate-spin text-blue-400" /> : <Wifi className="size-3.5" style={{ color: 'var(--text-muted)' }} />}
                  </button>
                <button
                  onClick={() => showConfirm({
                    title: 'Delete Proxy',
                    message: 'Remove this proxy configuration?',
                    confirmText: 'Delete',
                    variant: 'danger',
                    onConfirm: () => deleteProxy(proxy.id),
                  })}
                  disabled={deletingId === proxy.id}
                  className="p-2 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50 shrink-0"
                  title="Remove proxy"
                >
                  {deletingId === proxy.id
                    ? <Loader2 className="size-4 animate-spin text-red-400" />
                    : <Trash2 className="size-4 text-red-400/60 hover:text-red-400" />
                  }
                </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open={confirm.open}
          onClose={closeConfirm}
          onConfirm={confirm.onConfirm}
          title={confirm.title}
          message={confirm.message}
          content={confirm.content}
          confirmText={confirm.confirmText}
          variant={confirm.variant}
        />
      )}
    </div>
  )
}

/* ─── Droplets Tab ─── */

interface Droplet {
  id: number
  name: string
  status: string
  size_slug: string
  region: { slug: string; name: string }
  image: { slug: string; name: string; distribution: string }
  networks: {
    v4: { ip_address: string; type: string }[]
    v6: { ip_address: string; type: string }[]
  }
  created_at: string
}

function DropletsTab() {
  const [accounts, setAccounts] = useState<DOAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [droplets, setDroplets] = useState<Droplet[]>([])
  const [loading, setLoading] = useState(true)
  const [dropletsLoading, setDropletsLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({ name: '', region: 'sgp1', size: 's-2vcpu-4gb', image: 'ubuntu-22-04-x64' })
  const [installRdp, setInstallRdp] = useState(false)
  const [installPrice, setInstallPrice] = useState(1000)
  const [selectedOS, setSelectedOS] = useState('')
  const [rdpPassword, setRdpPassword] = useState('')
  const [rdpType, setRdpType] = useState<'dedicated' | 'docker'>('dedicated')
  const [osVersions, setOsVersions] = useState<any[]>([])
  const [userBalance, setUserBalance] = useState(0)
  const [sizeGroups, setSizeGroups] = useState<Record<string, any[]>>({})
  const [sizesLoading, setSizesLoading] = useState(false)
  const [limits, setLimits] = useState<{ droplet_limit: number; droplet_count: number; remaining: number } | null>(null)
  const [regions, setRegions] = useState<{ slug: string; name: string; available: boolean }[]>([])
  const [regionsLoading, setRegionsLoading] = useState(false)
  const [imageGroups, setImageGroups] = useState<Record<string, { slug: string; name: string; distribution: string }[]>>({})
  const [imagesLoading, setImagesLoading] = useState(false)
  const [createProgress, setCreateProgress] = useState(0)
  const [createStatus, setCreateStatus] = useState('')
  const [vpsPassword, setVpsPassword] = useState('')
  const [pollingActions, setPollingActions] = useState<Record<number, string>>({})
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; dropletId: number; dropletName: string }>({ open: false, dropletId: 0, dropletName: '' })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; dropletId: number; currentName: string }>({ open: false, dropletId: 0, currentName: '' })
  const [renameLoading, setRenameLoading] = useState(false)
  const [rebuildDialog, setRebuildDialog] = useState<{ open: boolean; dropletId: number; dropletName: string }>({ open: false, dropletId: 0, dropletName: '' })
  const [rebuildLoading, setRebuildLoading] = useState(false)
  const { confirm, showConfirm, closeConfirm } = useConfirmDialog()

  // On mount: clear stale create progress (backend handles pending RDP installs now)
  useEffect(() => {
    sessionStorage.removeItem('cloud_create_progress')
  }, [])

  // Persist create VPS progress to sessionStorage
  useEffect(() => {
    if (createProgress > 0 && createProgress < 100) {
      sessionStorage.setItem('cloud_create_progress', JSON.stringify({
        progress: createProgress,
        status: createStatus,
        creating,
        timestamp: Date.now()
      }))
    } else if (createProgress >= 100 || createProgress === 0) {
      sessionStorage.removeItem('cloud_create_progress')
    }
  }, [createProgress, createStatus, creating])

  // Fetch accounts
  useEffect(() => {
    fetch('/api/cloud/accounts').then(r => r.json()).then(d => {
      const accs = d.data || []
      setAccounts(accs)
      if (accs.length > 0) setSelectedAccount(accs[0].id)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Fetch install price, OS versions, and user balance on mount
  useEffect(() => {
    fetch('/api/public/settings').then(r => r.json()).then(d => {
      const p = d.data?.install_price
      setInstallPrice(typeof p === 'object' ? (p.amount || 1000) : (parseInt(p) || 1000))
    }).catch(() => {})
    fetch('/api/public/os-versions').then(r => r.json()).then(d => setOsVersions(d.data || [])).catch(() => {})
    fetch('/api/profile').then(r => r.json()).then(d => setUserBalance(d.data?.credit_balance || 0)).catch(() => {})
  }, [])

  // Fetch regions when account changes
  const fetchRegions = useCallback(async () => {
    if (!selectedAccount) return
    setRegionsLoading(true)
    try {
      const res = await fetch(`/api/cloud/regions?account_id=${selectedAccount}`)
      const json = await res.json()
      if (json.success) {
        setRegions(json.data || [])
        // Auto-select first region if current selection not in list
        const slugs = (json.data || []).map((r: any) => r.slug)
        if (slugs.length > 0 && !slugs.includes(createForm.region)) {
          setCreateForm(f => ({ ...f, region: slugs[0] }))
        }
      }
    } catch { /* silent */ } finally { setRegionsLoading(false) }
  }, [selectedAccount, createForm.region])

  // Fetch images when account changes
  const fetchImages = useCallback(async () => {
    if (!selectedAccount) return
    setImagesLoading(true)
    try {
      const res = await fetch(`/api/cloud/images?account_id=${selectedAccount}&type=distribution`)
      const json = await res.json()
      if (json.success) {
        setImageGroups(json.data || {})
        // Auto-select first image if current selection not in list
        const allSlugs = Object.values(json.data || {}).flat().map((i: any) => i.slug)
        if (allSlugs.length > 0 && !allSlugs.includes(createForm.image)) {
          setCreateForm(f => ({ ...f, image: allSlugs[0] }))
        }
      }
    } catch { /* silent */ } finally { setImagesLoading(false) }
  }, [selectedAccount, createForm.image])

  useEffect(() => {
    if (selectedAccount) { fetchRegions(); fetchImages() }
  }, [selectedAccount, fetchRegions, fetchImages])

  // Fetch droplets when account changes
  const fetchDroplets = useCallback(async () => {
    if (!selectedAccount) { setDroplets([]); return }
    setDropletsLoading(true)
    try {
      const res = await fetch(`/api/cloud/droplets?account_id=${selectedAccount}`)
      const json = await res.json()
      if (json.success) {
        const fetched = json.data || []
        setDroplets(fetched)
      } else throw new Error(json.error)
    } catch (e: any) {
      showToast(e.message || 'Failed to fetch droplets', 'error')
      setDroplets([])
    } finally { setDropletsLoading(false) }
  }, [selectedAccount])

  useEffect(() => { if (selectedAccount) fetchDroplets() }, [selectedAccount, fetchDroplets])

  // Process pending RDP installs in background (survives page refresh)
  useEffect(() => {
    const processPending = () => {
      fetch('/api/cron/process-pending-rdp', { method: 'POST' }).catch(() => {})
    }
    // Run immediately on mount
    processPending()
    // Then every 15 seconds
    const interval = setInterval(processPending, 15000)
    return () => clearInterval(interval)
  }, [])

  // Fetch dynamic sizes when region or account changes
  const fetchSizes = useCallback(async (region: string) => {
    if (!selectedAccount) return
    setSizesLoading(true)
    try {
      const res = await fetch(`/api/cloud/sizes?account_id=${selectedAccount}&region=${region}`)
      const data = await res.json()
      if (data.success) {
        setSizeGroups(data.data)
        if (data.limits) setLimits(data.limits)
        // Auto-select first available size if current selection not in new list
        const allSlugs = Object.values(data.data).flat().map((s: any) => s.slug)
        if (!allSlugs.includes(createForm.size) && allSlugs.length > 0) {
          setCreateForm(f => ({ ...f, size: allSlugs[0] }))
        }
      }
    } catch { /* silent */ } finally { setSizesLoading(false) }
  }, [selectedAccount, createForm.size])

  useEffect(() => {
    if (selectedAccount && createForm.region) fetchSizes(createForm.region)
  }, [selectedAccount, createForm.region, fetchSizes])

  // Fetch just the limits from DO API (lightweight, no size re-fetch needed)
  const fetchLimits = useCallback(async () => {
    if (!selectedAccount || !createForm.region) return
    try {
      const res = await fetch(`/api/cloud/sizes?account_id=${selectedAccount}&region=${createForm.region}`)
      const data = await res.json()
      if (data.limits) setLimits(data.limits)
    } catch { /* silent */ }
  }, [selectedAccount, createForm.region])

  const getPublicIP = (droplet: Droplet) => {
    const v4 = droplet.networks?.v4?.find(n => n.type === 'public')
    return v4?.ip_address || '—'
  }

  const performAction = async (dropletId: number, action: string, extra?: Record<string, any>) => {
    const key = `${dropletId}-${action}`
    setActionLoading(key)
    try {
      const res = await fetch('/api/cloud/droplets/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, droplet_id: dropletId, action, ...extra }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Action failed')
      showToast(`Action "${action}" triggered`, 'success')
      // Start polling for status change
      setPollingActions(prev => ({ ...prev, [dropletId]: action }))
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setActionLoading(null) }
  }

  // Realtime status polling after actions
  useEffect(() => {
    const ids = Object.keys(pollingActions)
    if (ids.length === 0 || !selectedAccount) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cloud/droplets?account_id=${selectedAccount}`)
        const json = await res.json()
        if (!json.success) return
        const fetched: Droplet[] = json.data || []
        setDroplets(fetched)

        const newPolling = { ...pollingActions }
        let changed = false
        for (const [id, action] of Object.entries(newPolling)) {
          const droplet = fetched.find(d => d.id === Number(id))
          if (!droplet) { delete newPolling[Number(id)]; changed = true; continue }

          const targetReached =
            (action === 'reboot' && droplet.status === 'active') ||
            (action === 'power_on' && droplet.status === 'active') ||
            (action === 'shutdown' && droplet.status === 'off') ||
            (action === 'power_off' && droplet.status === 'off') ||
            (action === 'rebuild' && droplet.status === 'active')

          if (targetReached) {
            delete newPolling[Number(id)]
            changed = true
            showToast(`"${droplet.name}" is now ${droplet.status}`, 'success')
          }
        }
        if (changed) setPollingActions(newPolling)
      } catch { /* silent */ }
    }, 3000)

    return () => clearInterval(interval)
  }, [pollingActions, selectedAccount])

  const deleteDroplet = async (dropletId: number) => {
    setActionLoading(`${dropletId}-delete`)
    // Optimistic remove — hide from list immediately
    const backup = [...droplets]
    setDroplets(prev => prev.filter(d => d.id !== dropletId))
    try {
      const res = await fetch('/api/cloud/droplets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, droplet_id: dropletId }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      showToast('Droplet deleted', 'success')
      fetchLimits()
    } catch (e: any) {
      // Rollback on failure
      setDroplets(backup)
      showToast(e.message, 'error')
    } finally { setActionLoading(null) }
  }

  const renameDroplet = async (dropletId: number, newName: string) => {
    setRenameLoading(true)
    // Optimistic update — show new name immediately
    const oldName = droplets.find(d => d.id === dropletId)?.name || ''
    setDroplets(prev => prev.map(d => d.id === dropletId ? { ...d, name: newName } : d))
    setRenameDialog({ open: false, dropletId: 0, currentName: '' })
    try {
      const res = await fetch('/api/cloud/droplets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, droplet_id: dropletId, name: newName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to rename')
      showToast(`Renamed to "${newName}"`, 'success')
    } catch (e: any) {
      // Rollback on failure
      setDroplets(prev => prev.map(d => d.id === dropletId ? { ...d, name: oldName } : d))
      showToast(e.message, 'error')
    } finally { setRenameLoading(false) }
  }

  const setDropletPassword = async (dropletId: number, currentPassword: string, newPassword: string) => {
    setPasswordLoading(true)
    try {
      const res = await fetch('/api/cloud/droplets/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, droplet_id: dropletId, current_password: currentPassword, new_password: newPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to set password')
      showToast('Root password changed successfully', 'success')
      setPasswordDialog({ open: false, dropletId: 0, dropletName: '' })
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setPasswordLoading(false) }
  }

  const rebuildDroplet = async (dropletId: number, image: string) => {
    setRebuildLoading(true)
    try {
      await performAction(dropletId, 'rebuild', { image })
      showToast('Rebuild started', 'success')
      setRebuildDialog({ open: false, dropletId: 0, dropletName: '' })
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally { setRebuildLoading(false) }
  }

  const createDroplet = async (withRdp = false) => {
    setCreating(true)
    setCreateProgress(5)
    setCreateStatus('Creating droplet...')
    try {
      // Step 1: Create droplet
      setCreateProgress(10)
      const res = await fetch('/api/cloud/droplets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedAccount,
          name: createForm.name || `cobain-${Date.now()}`,
          region: createForm.region,
          size: createForm.size,
          image: createForm.image,
          install_rdp: withRdp,
          // When RDP enabled: send rdp_password (used as VPS root password via cloud-init)
          // When RDP disabled: send vps_password if set
          ...(withRdp ? { rdp_password: rdpPassword, windows_version: selectedOS, rdp_type: rdpType } : vpsPassword ? { vps_password: vpsPassword } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create droplet')

      const droplet = json.data
      setCreateProgress(30)
      setCreateStatus('Droplet created, waiting for IP...')
      showToast('Droplet created! Waiting for IP assignment...', 'info')

      // Step 2: Poll for IP
      const dropletId = droplet?.id
      let ip = ''
      for (let i = 0; i < 30; i++) {
        setCreateProgress(30 + Math.floor(i * 2))
        await new Promise(r => setTimeout(r, 5000))

        const statusRes = await fetch(`/api/cloud/droplets?account_id=${selectedAccount}`)
        const statusData = await statusRes.json()
        const found = (statusData.data || []).find((d: Droplet) => d.id === dropletId)

        if (found?.networks?.v4?.length > 0) {
          const pubIp = found.networks.v4.find((n: { type: string }) => n.type === 'public')?.ip_address
          if (pubIp) {
            ip = pubIp
            setCreateProgress(80)
            setCreateStatus(`IP assigned: ${ip}`)
            showToast(`Droplet ready! IP: ${ip}`, 'success')
            break
          }
        }
        setCreateStatus(`Waiting for IP... (${i + 1}/30)`)
      }

      if (!ip) {
        setCreateStatus('Droplet created but IP not yet assigned. Waiting...')
        // Keep polling for IP
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 5000))
          const retryRes = await fetch(`/api/cloud/droplets?account_id=${selectedAccount}`)
          const retryData = await retryRes.json()
          const retryFound = (retryData.data || []).find((d: Droplet) => d.id === dropletId)
          const retryIp = retryFound?.networks?.v4?.find((n: { type: string }) => n.type === 'public')?.ip_address
          if (retryIp) { ip = retryIp; break }
          setCreateStatus(`Still waiting for IP... (${i + 1}/30)`)
        }
        if (!ip) {
          showToast('Droplet created but IP not assigned after timeout.', 'error')
        }
      }

      // Step 3: Wait for VPS to be fully active (status === 'active')
      if (ip && dropletId) {
        setCreateProgress(82)
        setCreateStatus('VPS booting up...')
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 5000))
          try {
            const statusRes = await fetch(`/api/cloud/droplets?account_id=${selectedAccount}`)
            const statusData = await statusRes.json()
            const found = (statusData.data || []).find((d: Droplet) => d.id === dropletId)
            if (found) {
              setDroplets(prev => {
                const exists = prev.find(d => d.id === dropletId)
                return exists ? prev.map(d => d.id === dropletId ? found : d) : [...prev, found]
              })
              if (found.status === 'active') {
                setCreateProgress(90)
                setCreateStatus('VPS is active!')
                showToast(`VPS "${found.name}" is now active`, 'success')
                break
              }
            }
            setCreateStatus(`VPS booting up... (status: ${found?.status || 'new'}) (${i + 1}/40)`)
            setCreateProgress(82 + Math.floor(i * 0.2))
          } catch { /* retry */ }
        }
      }

      // Step 4: If RDP enabled, backend cron handles the rest
      // RDP intent already saved in do_droplets table at create time.
      // Backend polls: pending_ip -> pending_active -> pending_ssh -> triggering -> triggered
      if (withRdp) {
        setCreateProgress(95)
        setCreateStatus('VPS ready! RDP installation will start automatically...')
        showToast('VPS created! RDP installation is being processed in the background. Check Installations page for progress.', 'success')
      }

      setCreateProgress(100)
      setCreateStatus('Complete')
      setShowCreate(false)
      setCreateForm({ name: '', region: 'sgp1', size: 's-2vcpu-4gb', image: 'ubuntu-22-04-x64' })
      setInstallRdp(false)
      setSelectedOS('')
      setRdpPassword('')
      setVpsPassword('')
      fetchDroplets()
      fetchLimits()
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error')
      setCreateStatus(`Error: ${e.message}`)
    } finally {
      setCreating(false)
      setCreateProgress(100)
      setCreateStatus('Complete')
      sessionStorage.removeItem('cloud_create_progress')
      setTimeout(() => { setCreateProgress(0); setCreateStatus('') }, 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-gray-600" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl py-16 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        <Key className="size-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No accounts available</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add a DigitalOcean account in the Accounts tab first</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Account selector + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none min-w-[200px]"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
        >
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.email || maskToken(acc.token)}</option>
          ))}
        </select>
        <button
          onClick={fetchDroplets}
          disabled={dropletsLoading}
          className="p-2 rounded-lg transition-colors hover:bg-white/[0.04] disabled:opacity-50"
          title="Refresh droplets"
        >
          <RefreshCw className={cn('size-4', dropletsLoading && 'animate-spin')} style={{ color: 'var(--text-secondary)' }} />
        </button>
        {limits && (
          <div className="text-xs" style={{ color: (limits.droplet_limit - droplets.length) <= 0 ? 'var(--rose)' : 'var(--text-muted)' }}>
            Droplets: {droplets.length}/{limits.droplet_limit}
            {(limits.droplet_limit - droplets.length) <= 0 ? ' (limit reached)' : ` (${limits.droplet_limit - droplets.length} remaining)`}
          </div>
        )}
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            disabled={!limits || (limits.droplet_limit - droplets.length) <= 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110 ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--q-accent)', color: '#000' }}
          >
            <Plus className="size-4" />
            Create Droplet
          </button>
        )}
      </div>

      {/* Droplet limit reached banner */}
      {limits && (limits.droplet_limit - droplets.length) <= 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)' }}>
          <Shield className="size-4 shrink-0 text-red-400" />
          <div>
            <div className="text-sm font-medium text-red-400">Droplet limit reached</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              You have {droplets.length}/{limits.droplet_limit} droplets. Delete existing droplets or contact DigitalOcean to increase your limit.
            </div>
          </div>
        </div>
      )}

      {/* Create Droplet Form */}
      {showCreate && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-sm font-medium text-white">Create Droplet</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
              <input
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value.replace(/[^a-zA-Z0-9.\-]/g, '-') }))}
                maxLength={253}
                placeholder={`cobain-${Date.now()}`}
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Only a-z, 0-9, dots and dashes</p>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Region</label>
              <select
                value={createForm.region}
                onChange={e => setCreateForm(f => ({ ...f, region: e.target.value }))}
                disabled={regionsLoading}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none disabled:opacity-50"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              >
                {regionsLoading ? (
                  <option value="">Loading regions...</option>
                ) : regions.length > 0 ? (
                  regions.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)
                ) : (
                  DO_REGIONS.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Size</label>
              <select
                value={createForm.size}
                onChange={e => setCreateForm(f => ({ ...f, size: e.target.value }))}
                disabled={sizesLoading}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none disabled:opacity-50"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              >
                {sizesLoading ? (
                  <option value="">Loading sizes...</option>
                ) : Object.keys(sizeGroups).length > 0 ? (
                  <>
                    <option value="">Select size...</option>
                    {Object.entries(sizeGroups).map(([group, sizes]) => (
                      <optgroup key={group} label={group}>
                        {(sizes as any[]).map(s => (
                          <option key={s.slug} value={s.slug}>
                            {s.vcpus} vCPU / {s.memoryGB}GB RAM / {s.disk}GB Disk — ${s.price_monthly}/mo
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </>
                ) : (
                  <>
                    {DO_SIZES.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                  </>
                )}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Image</label>
              <select
                value={createForm.image}
                onChange={e => setCreateForm(f => ({ ...f, image: e.target.value }))}
                disabled={imagesLoading}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none disabled:opacity-50"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              >
                {imagesLoading ? (
                  <option value="">Loading images...</option>
                ) : Object.keys(imageGroups).length > 0 ? (
                  <>
                    <option value="">Select image...</option>
                    {Object.entries(imageGroups).map(([dist, images]) => (
                      <optgroup key={dist} label={dist}>
                        {images.map(img => (
                          <option key={img.slug} value={img.slug}>{img.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </>
                ) : (
                  DO_IMAGES.map(i => <option key={i.slug} value={i.slug}>{i.name}</option>)
                )}
              </select>
            </div>
          </div>

          {/* VPS Root Password (always shown, required) */}
          {!installRdp && (
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>VPS Root Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  type="password"
                  value={vpsPassword}
                  onChange={e => setVpsPassword(e.target.value)}
                  maxLength={72}
                  placeholder="6–72 characters (required)"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none pr-10"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5" style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Set via cloud-init. 6–72 chars. Enables SSH password auth.</p>
            </div>
          )}

          {/* Install RDP toggle */}
          <div className="rounded-xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white">Install RDP after creation</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Auto-install Windows RDP (Rp {installPrice.toLocaleString('id-ID')})
                </div>
              </div>
              <button
                onClick={() => {
                  if (!installRdp && userBalance < installPrice) {
                    showToast('Insufficient balance (need Rp ' + installPrice.toLocaleString('id-ID') + ')', 'error')
                    return
                  }
                  setInstallRdp(!installRdp)
                  if (!installRdp) setVpsPassword('') // Clear VPS password when enabling RDP
                }}
                className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                style={{ background: installRdp ? 'var(--q-accent)' : 'var(--surface-3)' }}
              >
                <div
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ transform: installRdp ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>

            {installRdp && (
              <div className="mt-4 space-y-3">
                {/* RDP Type */}
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Installation Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setRdpType('dedicated'); setSelectedOS('') }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all ${
                        rdpType === 'dedicated' ? 'ring-2 ring-blue-500/60 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                      style={{
                        background: rdpType === 'dedicated' ? 'rgba(59,130,246,0.08)' : 'var(--surface-2)',
                        border: `1px solid ${rdpType === 'dedicated' ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      <div className="font-medium">Dedicated</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Full OS reinstall</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRdpType('docker'); setSelectedOS('') }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all ${
                        rdpType === 'docker' ? 'ring-2 ring-blue-500/60 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                      style={{
                        background: rdpType === 'docker' ? 'rgba(59,130,246,0.08)' : 'var(--surface-2)',
                        border: `1px solid ${rdpType === 'docker' ? 'rgba(59,130,246,0.3)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      <div className="font-medium">Docker</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Windows via container</div>
                    </button>
                  </div>
                </div>
                {/* OS Selection */}
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Windows Version</label>
                  <select
                    value={selectedOS}
                    onChange={e => setSelectedOS(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none appearance-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                  >
                    <option value="">Select OS...</option>
                    {rdpType === 'docker' ? (
                    ['docker_desktop', 'docker_server', 'docker_lite'].map(cat => {
                    const items = DOCKER_OS_VERSIONS.filter(v => v.category === cat)
                    if (items.length === 0) return null
                    const labels: Record<string, string> = { docker_desktop: 'Desktop', docker_server: 'Server', docker_lite: 'Lightweight / Custom' }
                        return (
                          <optgroup key={cat} label={labels[cat] || cat}>
                            {items.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </optgroup>
                        )
                      })
                    ) : (
                      ['windows11', 'windows10', 'server', 'lite', 'uefi', 'legacy'].map(cat => {
                        const items = osVersions.filter((v: any) => v.category === cat)
                        if (items.length === 0) return null
                        const labels: Record<string, string> = { windows11: 'Windows 11', windows10: 'Windows 10', server: 'Server', lite: 'Lite', uefi: 'UEFI', legacy: 'Legacy' }
                        return (
                          <optgroup key={cat} label={labels[cat] || cat}>
                            {items.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </optgroup>
                        )
                      })
                    )}
                  </select>
                </div>
                {/* RDP Password */}
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>RDP Password</label>
                  <input
                    type="password"
                  value={rdpPassword}
                  onChange={e => setRdpPassword(e.target.value)}
                  maxLength={72}
                  placeholder="6–72 characters"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                  />
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Balance: Rp {userBalance.toLocaleString('id-ID')} | Cost: Rp {installPrice.toLocaleString('id-ID')}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setShowCreate(false); setInstallRdp(false); setSelectedOS(''); setRdpPassword(''); setVpsPassword(''); setRdpType('dedicated') }}
              disabled={creating}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Validate password
                if (!installRdp && (!vpsPassword || vpsPassword.length < 6)) {
                  showToast('VPS root password is required (min 6 chars)', 'error')
                  return
                }
                if (!installRdp && vpsPassword.length > 72) {
                  showToast('VPS password must be at most 72 characters', 'error')
                  return
                }
                if (installRdp && (!selectedOS || rdpPassword.length < 6)) {
                  showToast('Select OS version and enter password (min 6 chars)', 'error')
                  return
                }
                if (installRdp && rdpPassword.length > 72) {
                  showToast('RDP password must be at most 72 characters', 'error')
                  return
                }

                // Resolve display names
                const regionName = DO_REGIONS.find(r => r.slug === createForm.region)?.name || createForm.region
                const sizeName = DO_SIZES.find(s => s.slug === createForm.size)?.name || createForm.size
                const allImages = Object.values(imageGroups).flat()
                const imageName = allImages.find(i => i.slug === createForm.image)?.name || DO_IMAGES.find(i => i.slug === createForm.image)?.name || createForm.image
                const dropletName = createForm.name || '(random)'

                // Docker OS name lookup
                const dockerOsNames: Record<string, string> = {}
                DOCKER_OS_VERSIONS.forEach(v => { dockerOsNames[v.id] = v.name })
                const osName = installRdp ? (dockerOsNames[selectedOS] || osVersions.find((v: any) => v.id === selectedOS)?.name || selectedOS) : null

                showConfirm({
                  title: 'Confirm Create Droplet',
                  message: '',
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Review your droplet configuration:</p>
                      <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: 'var(--text-muted)' }}>Name</span>
                          <span className="text-white font-medium">{dropletName}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: 'var(--text-muted)' }}>Region</span>
                          <span className="text-white">{regionName}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: 'var(--text-muted)' }}>Size</span>
                          <span className="text-white">{sizeName}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: 'var(--text-muted)' }}>Image</span>
                          <span className="text-white">{imageName}</span>
                        </div>
                      </div>
                      {installRdp && (
                        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                          <div className="text-xs font-medium text-blue-400 mb-1">RDP Installation</div>
                          <div className="flex justify-between text-sm">
                            <span style={{ color: 'var(--text-muted)' }}>Type</span>
                            <span className="text-white capitalize">{rdpType}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span style={{ color: 'var(--text-muted)' }}>Windows</span>
                            <span className="text-white">{osName}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span style={{ color: 'var(--text-muted)' }}>Cost</span>
                            <span className="text-amber-400 font-medium">Rp {installPrice.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ),
                  confirmText: installRdp ? 'Create + Install RDP' : 'Create Droplet',
                  onConfirm: () => createDroplet(installRdp),
                })
              }}
              disabled={creating || !createForm.region || !createForm.size || !limits || (limits.droplet_limit - droplets.length) <= 0}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'var(--q-accent)', color: '#000' }}
            >
              {creating ? (
                <><Loader2 className="size-3.5 animate-spin" /> {installRdp ? 'Creating + Installing...' : 'Creating...'}</>
              ) : (
                installRdp ? 'Create + Install RDP' : 'Create Droplet'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Creation Progress */}
      {createProgress > 0 && (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: 'var(--text-muted)' }}>{createStatus}</span>
            <span className="text-white font-medium">{createProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${createProgress}%`, background: createProgress === 100 ? 'var(--green)' : 'var(--q-accent)' }}
            />
          </div>
        </div>
      )}

      {/* Droplets List */}
      {dropletsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-gray-600" />
        </div>
      ) : droplets.length === 0 ? (
        <div className="rounded-xl py-16 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <Server className="size-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No droplets found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Create a droplet to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {droplets.map(droplet => {
            const ip = getPublicIP(droplet)
            const statusCfg = DROPLET_STATUS[droplet.status] || DROPLET_STATUS.off
            return (
              <div
                key={droplet.id}
                className="rounded-xl p-4 transition-colors hover:brightness-105"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRenameDialog({ open: true, dropletId: droplet.id, currentName: droplet.name })}
                        className="flex items-center gap-1 group"
                        title="Click to rename"
                      >
                        <span className="text-sm font-medium text-white truncate group-hover:underline">{droplet.name}</span>
                        <Pencil className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', pollingActions[droplet.id] ? 'animate-pulse' : '', statusCfg.color)}>
                        <span className={cn('size-1.5 rounded-full', statusCfg.dot)} />
                        {droplet.status}
                      </span>
                      {pollingActions[droplet.id] && (
                        <span className="text-[10px] text-amber-400 animate-pulse">
                          {pollingActions[droplet.id] === 'reboot' ? 'Rebooting...' :
                           pollingActions[droplet.id] === 'power_on' ? 'Powering on...' :
                           pollingActions[droplet.id] === 'shutdown' ? 'Shutting down...' :
                           pollingActions[droplet.id] === 'power_off' ? 'Powering off...' :
                           pollingActions[droplet.id] === 'rebuild' ? 'Rebuilding...' : 'Processing...'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex items-center gap-1">
                        <Globe className="size-3" />
                        <span className="font-mono text-white">{ip}</span>
                        {ip !== '—' && <CopyBtn value={ip} />}
                      </span>
                      <span>{droplet.region?.name || droplet.region?.slug}</span>
                      <span>{droplet.size_slug}</span>
                      <span>{droplet.image?.distribution} {droplet.image?.name}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => showConfirm({
                        title: 'Reboot Droplet',
                        message: `Reboot "${droplet.name}"?`,
                        confirmText: 'Reboot',
                        variant: 'warning',
                        onConfirm: () => performAction(droplet.id, 'reboot'),
                      })}
                      disabled={actionLoading !== null}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                      title="Reboot"
                    >
                      {actionLoading === `${droplet.id}-reboot`
                        ? <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
                        : <RotateCcw className="size-3.5" style={{ color: 'var(--text-secondary)' }} />
                      }
                    </button>
                    <button
                      onClick={() => {
                        const isActive = droplet.status === 'active'
                        showConfirm({
                          title: isActive ? 'Shutdown Droplet' : 'Power On',
                          message: isActive ? `Shutdown "${droplet.name}"?` : `Power on "${droplet.name}"?`,
                          confirmText: isActive ? 'Shutdown' : 'Power On',
                          variant: isActive ? 'warning' : 'default',
                          onConfirm: () => performAction(droplet.id, isActive ? 'shutdown' : 'power_on'),
                        })
                      }}
                      disabled={actionLoading !== null}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                      title={droplet.status === 'active' ? 'Shutdown' : 'Power On'}
                    >
                      {actionLoading === `${droplet.id}-shutdown` || actionLoading === `${droplet.id}-power_on`
                        ? <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
                        : <Power className="size-3.5" style={{ color: droplet.status === 'active' ? 'var(--green)' : 'var(--text-muted)' }} />
                      }
                    </button>
                    <button
                      onClick={() => setPasswordDialog({ open: true, dropletId: droplet.id, dropletName: droplet.name })}
                      disabled={actionLoading !== null}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                      title="Set root password"
                    >
                      <KeyRound className="size-3.5" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      onClick={() => setRebuildDialog({ open: true, dropletId: droplet.id, dropletName: droplet.name })}
                      disabled={actionLoading !== null}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                      title="Rebuild droplet"
                    >
                      <HardDrive className="size-3.5" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      onClick={() => showConfirm({
                        title: 'Delete Droplet',
                        message: `Permanently delete "${droplet.name}"? This cannot be undone.`,
                        confirmText: 'Delete',
                        variant: 'danger',
                        onConfirm: () => deleteDroplet(droplet.id),
                      })}
                      disabled={actionLoading !== null}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      title="Delete droplet"
                    >
                      {actionLoading === `${droplet.id}-delete`
                        ? <Loader2 className="size-3.5 animate-spin text-red-400" />
                        : <Trash2 className="size-3.5 text-red-400/60 hover:text-red-400" />
                      }
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open={confirm.open}
          onClose={closeConfirm}
          onConfirm={confirm.onConfirm}
          title={confirm.title}
          message={confirm.message}
          content={confirm.content}
          confirmText={confirm.confirmText}
          variant={confirm.variant}
        />
      )}

      {/* Set Password Dialog */}
      <InputDialog
        open={passwordDialog.open}
        onClose={() => setPasswordDialog({ open: false, dropletId: 0, dropletName: '' })}
        onConfirm={(values) => setDropletPassword(passwordDialog.dropletId, values.current_password, values.new_password)}
        title="Set Root Password"
        message={`Change root password for "${passwordDialog.dropletName}". You need to know the current root password.`}
        confirmText="Change Password"
        variant="warning"
        loading={passwordLoading}
        fields={[
          { key: 'current_password', label: 'Current Root Password', type: 'password', placeholder: 'Enter current password', required: true },
          { key: 'new_password', label: 'New Root Password', type: 'password', placeholder: 'Min 6 characters', required: true },
        ]}
      />

      {/* Rename Dialog */}
      <InputDialog
        open={renameDialog.open}
        onClose={() => setRenameDialog({ open: false, dropletId: 0, currentName: '' })}
        onConfirm={(values) => renameDroplet(renameDialog.dropletId, values.name)}
        title="Rename Droplet"
        message={`Enter a new name for "${renameDialog.currentName}".`}
        confirmText="Rename"
        loading={renameLoading}
        fields={[
          { key: 'name', label: 'New Name', type: 'text', placeholder: renameDialog.currentName, required: true },
        ]}
      />

      {/* Rebuild Dialog */}
      <InputDialog
        open={rebuildDialog.open}
        onClose={() => setRebuildDialog({ open: false, dropletId: 0, dropletName: '' })}
        onConfirm={(values) => rebuildDroplet(rebuildDialog.dropletId, values.image)}
        title="Rebuild Droplet"
        message={`Rebuild "${rebuildDialog.dropletName}" with a new image. WARNING: This will destroy all data on the droplet!`}
        confirmText="Rebuild"
        variant="danger"
        loading={rebuildLoading}
        fields={[
          {
            key: 'image', label: 'Select Image', type: 'select', placeholder: 'Select image...', required: true,
            options: Object.keys(imageGroups).length > 0
              ? Object.entries(imageGroups).flatMap(([dist, images]) =>
                  images.map(img => ({ value: img.slug, label: img.name, group: dist }))
                )
              : DO_IMAGES.map(i => ({ value: i.slug, label: i.name })),
          },
        ]}
      />
    </div>
  )
}

/* ─── Main Page ─── */

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Cloud }[] = [
  { key: 'accounts', label: 'Accounts', icon: Key },
  { key: 'proxies', label: 'Proxies', icon: Globe },
  { key: 'droplets', label: 'Droplets', icon: Server },
]

export default function CloudPage() {
  const [tab, setTab] = useState<Tab>('accounts')

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Cloud Manager</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Manage DigitalOcean accounts, proxies, and droplets
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-1)' }}>
        {TAB_CONFIG.map(t => {
          const Icon = t.icon
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: isActive ? 'var(--q-accent)' : 'transparent',
                color: isActive ? '#000' : 'var(--text-muted)',
              }}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'accounts' && <AccountsTab />}
      {tab === 'proxies' && <ProxiesTab />}
      {tab === 'droplets' && <DropletsTab />}
    </div>
  )
}
