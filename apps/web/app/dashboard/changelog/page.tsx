'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, Wrench, Info, Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

interface ChangelogEntry {
  id: string
  title: string
  content: string
  category: 'update' | 'maintenance' | 'info'
  createdAt: string
}

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/changelog?page=${page}&limit=8`)
      const d = await res.json()
      setEntries(d.data || [])
      setTotalPages(d.pagination?.totalPages || 1)
    } catch { /* silent */ }
    setLoading(false)
  }, [page])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filtered =
    filter === 'all' ? entries : entries.filter((e) => e.category === filter)

  return (
    <div className="max-w-2xl mx-auto py-4">
      <h1 className="text-2xl font-semibold text-white">Changelog</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
        Latest updates and maintenance info
      </p>

      {/* Filter tabs */}
      <div className="flex gap-2 mt-6">
        {['all', 'update', 'maintenance', 'info'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background:
                filter === f ? 'var(--q-accent)' : 'var(--surface-2)',
              color: filter === f ? '#000' : 'var(--text-muted)',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="size-5 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            <Megaphone className="size-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No entries yet</p>
          </div>
        ) : (
          <>
            {filtered.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl p-4 lg:p-5"
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="size-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{
                      background:
                        entry.category === 'update'
                          ? 'rgba(0,245,212,0.1)'
                          : entry.category === 'info'
                          ? 'rgba(59,130,246,0.1)'
                          : 'rgba(245,158,11,0.1)',
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
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white">{entry.title}</h3>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: entry.category === 'update' ? 'rgba(0,245,212,0.1)' : entry.category === 'info' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)',
                          color: entry.category === 'update' ? 'var(--q-accent)' : entry.category === 'info' ? '#3b82f6' : 'var(--amber)',
                        }}
                      >
                        {entry.category}
                      </span>
                    </div>
                    <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                      {entry.content}
                    </p>
                    <div className="flex items-center gap-1 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Calendar className="size-3" />
                      {new Date(entry.createdAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
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
