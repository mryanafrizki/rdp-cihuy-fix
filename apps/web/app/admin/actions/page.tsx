'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Plus, PencilLine, Trash2, Zap, Shield, AlertTriangle, X, Check, Lock } from 'lucide-react'

type FeeMode = 'admin' | 'user'

export default function AdminActionsPage() {
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'super_admin'
  const [loading, setLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Manual Top-up
  const [topupEmail, setTopupEmail] = useState('')
  const [topupAmount, setTopupAmount] = useState('')

  // Edit Balance
  const [editEmail, setEditEmail] = useState('')
  const [newBalance, setNewBalance] = useState('')

  // Delete User
  const [deleteEmail, setDeleteEmail] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Fee Settings
  const [feeMode, setFeeMode] = useState<FeeMode>('user')
  const [feeModeLoaded, setFeeModeLoaded] = useState(false)

  // Load fee mode on mount
  useEffect(() => {
    async function loadFeeMode() {
      try {
        const res = await fetch('/api/admin/settings')
        if (res.ok) {
          const json = await res.json()
          if (json.data?.fee_mode) {
            setFeeMode(json.data.fee_mode as FeeMode)
          }
        }
      } catch { /* silent */ }
      setFeeModeLoaded(true)
    }
    loadFeeMode()
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleAction = async (action: string, data: Record<string, unknown>) => {
    try {
      setLoading(action)
      setToast(null)

      const response = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Action failed')
      }

      const result = await response.json()
      setToast({ type: 'success', text: result.message || 'Action completed' })

      if (action === 'topup') { setTopupEmail(''); setTopupAmount('') }
      else if (action === 'edit_balance') { setEditEmail(''); setNewBalance('') }
      else if (action === 'delete_user') { setDeleteEmail(''); setShowDeleteModal(false); setDeleteConfirmText('') }
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' })
    } finally {
      setLoading(null)
    }
  }

  const handleSaveFeeMode = async () => {
    try {
      setLoading('fee_mode')
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'fee_mode', value: feeMode }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setToast({ type: 'success', text: `Fee mode set to "${feeMode}"` })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save fee mode' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">Admin Actions</h1>
        <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Manage user balances, accounts, and fee configuration
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

      {!isSuperAdmin ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <Lock className="size-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-lg font-semibold text-white">Super Admin Only</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>These actions require super admin privileges.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        {/* ─── Manual Top-up ─── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(0,245,212,0.08)' }}>
              <Plus className="size-4" style={{ color: 'var(--q-accent)' }} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">Manual Top-up</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Add credits to a user account</p>
            </div>
          </div>
          <div className="p-3 lg:p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={topupEmail}
                onChange={(e) => setTopupEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all focus:ring-1"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,212,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Amount (IDR)</label>
              <input
                type="number"
                placeholder="50000"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,212,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
            <button
              onClick={() => handleAction('topup', { email: topupEmail, amount: parseFloat(topupAmount) })}
              disabled={loading === 'topup' || !topupEmail || !topupAmount}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: 'var(--q-accent)',
                color: '#0a0a0a',
              }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {loading === 'topup' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {loading === 'topup' ? 'Processing...' : 'Add Credit'}
            </button>
          </div>
        </div>

        {/* ─── Edit Balance (super_admin) ─── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.08)' }}>
              <PencilLine className="size-4" style={{ color: 'var(--amber)' }} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">Edit Balance</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Set exact balance
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>
                  super_admin
                </span>
              </p>
            </div>
          </div>
          <div className="p-3 lg:p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>New Balance (IDR)</label>
              <input
                type="number"
                placeholder="100000"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
            <button
              onClick={() => handleAction('edit_balance', { email: editEmail, new_balance: parseFloat(newBalance) })}
              disabled={loading === 'edit_balance' || !editEmail || !newBalance}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'var(--amber)', color: '#0a0a0a' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {loading === 'edit_balance' ? <Loader2 className="size-4 animate-spin" /> : <PencilLine className="size-4" />}
              {loading === 'edit_balance' ? 'Processing...' : 'Set Balance'}
            </button>
          </div>
        </div>

        {/* ─── Delete User (super_admin) ─── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.08)' }}>
              <Trash2 className="size-4" style={{ color: 'var(--rose)' }} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">Delete User</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Permanently remove account
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--rose)' }}>
                  super_admin
                </span>
              </p>
            </div>
          </div>
          <div className="p-3 lg:p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
            <button
              onClick={() => {
                if (!deleteEmail) return
                setShowDeleteModal(true)
                setDeleteConfirmText('')
              }}
              disabled={loading === 'delete_user' || !deleteEmail}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'rgba(244,63,94,0.15)', color: 'var(--rose)' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(244,63,94,0.25)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(244,63,94,0.15)' }}
            >
              {loading === 'delete_user' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {loading === 'delete_user' ? 'Deleting...' : 'Delete User'}
            </button>
          </div>
        </div>

        {/* ─── Fee Settings ─── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.08)' }}>
              <Zap className="size-4" style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">Fee Settings</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Toggle between admin and user fee modes</p>
            </div>
          </div>
          <div className="p-3 lg:p-4 space-y-3 lg:space-y-4">
            {/* Current mode indicator */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <Shield className="size-4" style={{ color: feeMode === 'admin' ? 'var(--q-accent)' : 'var(--amber)' }} />
              <div className="flex-1">
                <div className="text-xs font-medium text-white">
                  Current: {feeMode === 'admin' ? 'Admin Mode' : 'User Mode'}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {feeMode === 'admin' ? 'Flat rate, no fee applied' : 'Fee 0.7% + Rp 200 applied'}
                </div>
              </div>
              {!feeModeLoaded && <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--text-muted)' }} />}
            </div>

            {/* Toggle */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setFeeMode('admin')}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all text-center"
                style={{
                  background: feeMode === 'admin' ? 'rgba(0,245,212,0.1)' : 'var(--surface-2)',
                  border: `1px solid ${feeMode === 'admin' ? 'rgba(0,245,212,0.3)' : 'var(--border-subtle)'}`,
                  color: feeMode === 'admin' ? 'var(--q-accent)' : 'var(--text-muted)',
                }}
              >
                Admin Mode
              </button>
              <button
                onClick={() => setFeeMode('user')}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all text-center"
                style={{
                  background: feeMode === 'user' ? 'rgba(245,158,11,0.1)' : 'var(--surface-2)',
                  border: `1px solid ${feeMode === 'user' ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'}`,
                  color: feeMode === 'user' ? 'var(--amber)' : 'var(--text-muted)',
                }}
              >
                User Mode
              </button>
            </div>

            <button
              onClick={handleSaveFeeMode}
              disabled={loading === 'fee_mode'}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: '#a78bfa', color: '#0a0a0a' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {loading === 'fee_mode' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {loading === 'fee_mode' ? 'Saving...' : 'Save Fee Mode'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-md mx-4 rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.1)' }}>
                  <AlertTriangle className="size-5" style={{ color: 'var(--rose)' }} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Delete User</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This action cannot be undone</p>
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.1)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  You are about to permanently delete <strong className="text-white">{deleteEmail}</strong> and all associated data including installations and transactions.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Type <strong className="text-white">DELETE</strong> to confirm
                </label>
                <input
                  type="text"
                  placeholder="DELETE"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirmText('') }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction('delete_user', { email: deleteEmail })}
                  disabled={deleteConfirmText !== 'DELETE' || loading === 'delete_user'}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: 'var(--rose)', color: 'white' }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  {loading === 'delete_user' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  {loading === 'delete_user' ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
