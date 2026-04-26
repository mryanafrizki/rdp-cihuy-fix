'use client'

import { useState, useEffect, useCallback } from 'react'
import { Megaphone, Wrench, Info, Calendar, Trash2, Loader2, Plus, Check, X, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'

interface ChangelogEntry {
  id: string
  title: string
  content: string
  category: 'update' | 'maintenance' | 'info'
  showPopup?: boolean
  createdAt: string
}

export default function AdminChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<'update' | 'maintenance' | 'info'>('update')
  const [showPopup, setShowPopup] = useState(false)

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/changelog?page=${page}&limit=10`)
      if (res.ok) {
        const json = await res.json()
        setEntries(json.data || [])
        setTotalPages(json.pagination?.totalPages || 1)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [page])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), category, show_popup: showPopup }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create')
      }
      setTitle('')
      setContent('')
      setCategory('update')
      setShowPopup(false)
      await fetchEntries()
      setToast({ type: 'success', text: 'Changelog entry created' })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create' })
    } finally {
      setSubmitting(false)
    }
  }

  const togglePopup = async (id: string, showPopup: boolean) => {
    try {
      await fetch('/api/admin/changelog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, show_popup: showPopup })
      })
      await fetchEntries()
      setToast({ type: 'success', text: `Popup ${showPopup ? 'enabled' : 'disabled'}` })
    } catch {
      setToast({ type: 'error', text: 'Failed to toggle popup' })
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch('/api/admin/changelog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      await fetchEntries()
      setToast({ type: 'success', text: 'Entry deleted' })
    } catch (err) {
      setToast({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">Changelog</h1>
        <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Manage updates and maintenance announcements
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

      {/* Create Form */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(0,245,212,0.08)' }}>
            <Plus className="size-4" style={{ color: 'var(--q-accent)' }} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-white">New Entry</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create a new changelog entry</p>
          </div>
        </div>
        <div className="p-3 lg:p-4 space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New feature: Auto-renewal"
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,212,0.3)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the update or maintenance..."
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all resize-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,245,212,0.3)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Category</label>
            <div className="flex gap-2">
              {(['update', 'maintenance', 'info'] as const).map((cat) => {
                const catColors = { update: { bg: 'rgba(0,245,212,0.1)', border: 'rgba(0,245,212,0.3)', color: 'var(--q-accent)' }, maintenance: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: 'var(--amber)' }, info: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', color: '#3b82f6' } }
                const c = catColors[cat]
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize"
                    style={{
                      background: category === cat ? c.bg : 'var(--surface-2)',
                      border: `1px solid ${category === cat ? c.border : 'var(--border-subtle)'}`,
                      color: category === cat ? c.color : 'var(--text-muted)',
                    }}
                  >
                    {cat === 'update' ? 'Update' : cat === 'maintenance' ? 'Maintenance' : 'Info'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Show Popup */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPopup}
              onChange={(e) => setShowPopup(e.target.checked)}
              className="size-4 rounded accent-emerald-500"
              style={{ accentColor: 'var(--q-accent, #00f5d4)' }}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary, #8a8b9e)' }}>
              Show as popup to users
            </span>
          </label>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={submitting || !title.trim() || !content.trim()}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'var(--q-accent)', color: '#0a0a0a' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {submitting ? 'Creating...' : 'Create Entry'}
          </button>
        </div>
      </div>

      {/* Entries List */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="size-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
            <Megaphone className="size-4" style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-white">Entries</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{entries.length} total</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 lg:py-12 text-center">
            <Loader2 className="size-5 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 lg:py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No changelog entries yet
          </div>
        ) : (
          <>
          <div>
            {entries.map((entry) => (
              <div key={entry.id} className="px-4 py-3 flex items-start gap-3 group" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div
                  className="size-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: entry.category === 'update' ? 'rgba(0,245,212,0.08)' : entry.category === 'info' ? 'rgba(59,130,246,0.08)' : 'rgba(245,158,11,0.08)',
                  }}
                >
                  {entry.category === 'update' ? (
                    <Megaphone className="size-4" style={{ color: 'var(--q-accent)' }} />
                  ) : entry.category === 'info' ? (
                    <Info className="size-4" style={{ color: '#3b82f6' }} />
                  ) : (
                    <Wrench className="size-4" style={{ color: 'var(--amber)' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white truncate">{entry.title}</h3>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{
                        background: entry.category === 'update' ? 'rgba(0,245,212,0.1)' : entry.category === 'info' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)',
                        color: entry.category === 'update' ? 'var(--q-accent)' : entry.category === 'info' ? '#3b82f6' : 'var(--amber)',
                      }}
                    >
                      {entry.category}
                    </span>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {entry.content}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Calendar className="size-3" />
                    {new Date(entry.createdAt).toLocaleString('id-ID', {
                      timeZone: 'Asia/Jakarta',
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <button
                  onClick={() => togglePopup(entry.id, !entry.showPopup)}
                  className="text-xs px-2 py-1 rounded-lg shrink-0 transition-all"
                  style={{
                    background: entry.showPopup ? 'rgba(0,245,212,0.1)' : 'var(--surface-2)',
                    color: entry.showPopup ? 'var(--q-accent)' : 'var(--text-muted)'
                  }}
                >
                  {entry.showPopup ? 'Popup ON' : 'Popup OFF'}
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  disabled={deleting === entry.id}
                  className="size-7 rounded-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,63,94,0.1)'; e.currentTarget.style.color = '#fb7185' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  {deleting === entry.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 text-white"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  <ChevronLeft className="size-3" /> Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 text-white"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  Next <ChevronRight className="size-3" />
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
