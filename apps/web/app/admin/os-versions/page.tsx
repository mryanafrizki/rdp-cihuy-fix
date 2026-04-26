'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Monitor, Plus, Trash2, Check, X,
  AlertTriangle, Pencil, ChevronLeft, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

/* ─── Types ─── */
interface OsVersion {
  id: string
  name: string
  category: string
  enabled: boolean
}

const ITEMS_PER_PAGE = 15

export default function OsVersionsPage() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [osVersions, setOsVersions] = useState<OsVersion[]>([])
  const [osLoaded, setOsLoaded] = useState(false)
  const [newOsId, setNewOsId] = useState('')
  const [newOsName, setNewOsName] = useState('')
  const [newOsCategory, setNewOsCategory] = useState('desktop')
  const [editingOs, setEditingOs] = useState<string | null>(null)
  const [editOsName, setEditOsName] = useState('')
  const [deleteOsConfirm, setDeleteOsConfirm] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const loadOsVersions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/os-versions')
      if (res.ok) {
        const json = await res.json()
        setOsVersions(json.data || [])
      }
    } catch { /* silent */ }
    setOsLoaded(true)
  }, [])

  useEffect(() => { loadOsVersions() }, [loadOsVersions])

  const totalPages = Math.max(1, Math.ceil(osVersions.length / ITEMS_PER_PAGE))
  const paginatedVersions = osVersions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const handleAddOs = async () => {
    if (!newOsId.trim() || !newOsName.trim()) return
    try {
      setLoading('add_os')
      const res = await fetch('/api/admin/os-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newOsId.trim(), name: newOsName.trim(), category: newOsCategory }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add')
      }
      setNewOsId('')
      setNewOsName('')
      setNewOsCategory('desktop')
      await loadOsVersions()
      setToast({ type: 'success', text: `OS "${newOsName.trim()}" added` })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add OS' })
    } finally {
      setLoading(null)
    }
  }

  const handleUpdateOs = async (id: string, updates: Partial<OsVersion>) => {
    try {
      setLoading(`update_os_${id}`)
      const os = osVersions.find(o => o.id === id)
      if (!os) return
      const res = await fetch('/api/admin/os-versions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: updates.name ?? os.name, category: updates.category ?? os.category, enabled: updates.enabled ?? os.enabled }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setEditingOs(null)
      await loadOsVersions()
      setToast({ type: 'success', text: 'OS version updated' })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update' })
    } finally {
      setLoading(null)
    }
  }

  const handleDeleteOs = async (id: string) => {
    try {
      setLoading(`delete_os_${id}`)
      const res = await fetch('/api/admin/os-versions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      setDeleteOsConfirm(null)
      await loadOsVersions()
      setToast({ type: 'success', text: 'OS version deleted' })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3 lg:space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="size-7 rounded-md flex items-center justify-center transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">OS Versions</h1>
            <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Manage available Windows versions ({osVersions.length} total)
            </p>
          </div>
        </div>
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

      {/* Add new OS */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
            <Plus className="size-4" style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-white">Add New Version</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Add a new Windows version to the catalog</p>
          </div>
        </div>
        <div className="px-4 py-3" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>OS Code</label>
              <input
                type="text"
                placeholder="win11-pro"
                value={newOsId}
                onChange={(e) => setNewOsId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Name</label>
              <input
                type="text"
                placeholder="Windows 11 Pro"
                value={newOsName}
                onChange={(e) => setNewOsName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border-subtle)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Category</label>
              <select
                value={newOsCategory}
                onChange={(e) => setNewOsCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none transition-all appearance-none cursor-pointer"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border-subtle)' }}
              >
                <option value="desktop">Desktop</option>
                <option value="uefi">UEFI</option>
                <option value="server">Server</option>
                <option value="lite">Lite</option>
              </select>
            </div>
            <button
              onClick={handleAddOs}
              disabled={loading === 'add_os' || !newOsId.trim() || !newOsName.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
              style={{ background: '#3b82f6', color: 'white' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {loading === 'add_os' ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add
            </button>
          </div>
        </div>
      </div>

      {/* OS Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
            <Monitor className="size-4" style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-white">All Versions</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Toggle, edit, or remove OS versions</p>
          </div>
          <div className="ml-auto text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            {osVersions.length} versions
          </div>
        </div>

        <div className="overflow-x-auto">
          {!osLoaded ? (
            <div className="py-8 lg:py-12 text-center">
              <Loader2 className="size-5 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : osVersions.length === 0 ? (
            <div className="py-8 lg:py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No OS versions configured
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="text-left px-3 lg:px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>OS Code</th>
                  <th className="text-left px-3 lg:px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                  <th className="text-left px-3 lg:px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Category</th>
                  <th className="text-center px-3 lg:px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Enabled</th>
                  <th className="text-right px-3 lg:px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedVersions.map((os) => (
                  <tr key={os.id} className="group" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 lg:px-5 py-2.5">
                      <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                        {os.id}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-2.5">
                      {editingOs === os.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editOsName}
                            onChange={(e) => setEditOsName(e.target.value)}
                            className="px-2 py-1 rounded-lg text-sm text-white outline-none w-48"
                            style={{ background: 'var(--surface-3)', border: '1px solid rgba(59,130,246,0.3)' }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateOs(os.id, { name: editOsName })
                              if (e.key === 'Escape') setEditingOs(null)
                            }}
                          />
                          <button
                            onClick={() => handleUpdateOs(os.id, { name: editOsName })}
                            className="size-6 rounded flex items-center justify-center transition-colors"
                            style={{ color: 'var(--green)' }}
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingOs(null)}
                            className="size-6 rounded flex items-center justify-center transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-white">{os.name}</span>
                      )}
                    </td>
                    <td className="px-3 lg:px-5 py-2.5 hidden sm:table-cell">
                      <span
                        className="text-[11px] px-2 py-1 rounded-full font-medium"
                        style={{
                          background: os.category === 'server' ? 'rgba(167,139,250,0.1)' :
                            os.category === 'uefi' ? 'rgba(245,158,11,0.1)' :
                            os.category === 'lite' ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                          color: os.category === 'server' ? '#a78bfa' :
                            os.category === 'uefi' ? '#f59e0b' :
                            os.category === 'lite' ? '#22c55e' : '#60a5fa',
                        }}
                      >
                        {os.category}
                      </span>
                    </td>
                    <td className="px-3 lg:px-5 py-2.5 text-center">
                      <button
                        onClick={() => handleUpdateOs(os.id, { enabled: !os.enabled })}
                        disabled={loading === `update_os_${os.id}`}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50"
                        style={{
                          background: os.enabled ? 'var(--q-accent)' : 'var(--surface-3)',
                        }}
                      >
                        <span
                          className="inline-block size-4 rounded-full transition-transform duration-200"
                          style={{
                            background: os.enabled ? '#0a0a0a' : 'var(--text-muted)',
                            transform: os.enabled ? 'translateX(22px)' : 'translateX(4px)',
                          }}
                        />
                      </button>
                    </td>
                    <td className="px-3 lg:px-5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {editingOs !== os.id && (
                          <button
                            onClick={() => { setEditingOs(os.id); setEditOsName(os.name) }}
                            className="size-7 rounded-lg flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'white' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        {deleteOsConfirm === os.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteOs(os.id)}
                              disabled={loading === `delete_os_${os.id}`}
                              className="size-7 rounded-lg flex items-center justify-center transition-colors"
                              style={{ background: 'rgba(244,63,94,0.15)', color: 'var(--rose)' }}
                            >
                              {loading === `delete_os_${os.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                            </button>
                            <button
                              onClick={() => setDeleteOsConfirm(null)}
                              className="size-7 rounded-lg flex items-center justify-center transition-colors"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteOsConfirm(os.id)}
                            className="size-7 rounded-lg flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,63,94,0.1)'; e.currentTarget.style.color = 'var(--rose)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              >
                <ChevronLeft className="size-3" /> Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              >
                Next <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
