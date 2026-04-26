'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Megaphone, Wrench, Info, X } from 'lucide-react'

interface ChangelogEntry {
  id: string
  title: string
  content: string
  category: 'update' | 'maintenance' | 'info'
  showPopup: boolean
  createdAt: string
}

// Category display order: info first, then update, then maintenance
const CATEGORY_ORDER: ChangelogEntry['category'][] = ['info', 'update', 'maintenance']

const CATEGORY_CONFIG = {
  info: {
    icon: Info,
    color: 'var(--blue, #3b82f6)',
    label: 'Info',
  },
  update: {
    icon: Megaphone,
    color: 'var(--q-accent, #00f5d4)',
    label: 'Update',
  },
  maintenance: {
    icon: Wrench,
    color: 'var(--amber, #f59e0b)',
    label: 'Maintenance',
  },
}

function getDismissedCategories(): string[] {
  try {
    const raw = localStorage.getItem('dismissed_changelog_categories')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function dismissCategory(key: string) {
  const dismissed = getDismissedCategories()
  if (!dismissed.includes(key)) {
    dismissed.push(key)
    localStorage.setItem('dismissed_changelog_categories', JSON.stringify(dismissed))
  }
}

// Build a unique key for a set of entries in a category
// Includes latest createdAt so re-enabling popup (with new entry or updated entry) resets dismissal
function buildCategoryKey(category: string, entries: ChangelogEntry[]): string {
  const ids = entries.map(e => e.id).sort().join(',')
  const latest = entries.reduce((max, e) => e.createdAt > max ? e.createdAt : max, '')
  return `${category}:${ids}:${latest}`
}

export function ChangelogPopup() {
  const pathname = usePathname()
  const [queue, setQueue] = useState<{ category: ChangelogEntry['category']; entries: ChangelogEntry[]; key: string }[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [show, setShow] = useState(false)

  useEffect(() => {
    fetch('/api/admin/changelog?popup=true').then(r => r.json()).then(d => {
      const popupEntries = (d.data || []) as ChangelogEntry[]
      if (popupEntries.length === 0) { setShow(false); return }

      // Group by category
      const grouped: Record<string, ChangelogEntry[]> = {}
      for (const entry of popupEntries) {
        if (!grouped[entry.category]) grouped[entry.category] = []
        grouped[entry.category].push(entry)
      }

      // Build queue in order, skip dismissed categories
      const dismissed = getDismissedCategories()
      const newQueue: typeof queue = []
      for (const cat of CATEGORY_ORDER) {
        if (!grouped[cat] || grouped[cat].length === 0) continue
        const key = buildCategoryKey(cat, grouped[cat])
        if (dismissed.includes(key)) continue
        newQueue.push({ category: cat, entries: grouped[cat], key })
      }

      if (newQueue.length > 0) {
        setQueue(newQueue)
        setCurrentIndex(0)
        setShow(true)
      } else {
        setShow(false)
      }
    }).catch(() => {})
  }, [pathname])

  const dismiss = useCallback(() => {
    const current = queue[currentIndex]
    if (current) dismissCategory(current.key)

    const nextIndex = currentIndex + 1
    if (nextIndex < queue.length) {
      // Show next category popup
      setCurrentIndex(nextIndex)
    } else {
      setShow(false)
    }
  }, [queue, currentIndex])

  if (!show || queue.length === 0 || currentIndex >= queue.length) return null

  const current = queue[currentIndex]
  const config = CATEGORY_CONFIG[current.category]
  const Icon = config.icon

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.key}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="max-w-sm w-full rounded-2xl p-6 max-h-[80vh] flex flex-col"
          style={{ background: 'var(--surface-1, #111113)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icon className="size-4" style={{ color: config.color }} />
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: config.color }}
              >
                {config.label}
              </span>
              {queue.length > 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-3, #222)', color: 'var(--text-muted, #55566a)' }}>
                  {currentIndex + 1}/{queue.length}
                </span>
              )}
            </div>
            <button onClick={dismiss} style={{ color: 'var(--text-muted, #55566a)' }}>
              <X className="size-4" />
            </button>
          </div>

          {/* Entries list */}
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
            {current.entries.map((entry, i) => (
              <div key={entry.id}>
                {i > 0 && (
                  <div className="mb-3" style={{ borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }} />
                )}
                <h3 className="text-base font-semibold text-white">{entry.title}</h3>
                <p className="mt-1 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary, #8a8b9e)' }}>
                  {entry.content}
                </p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <button
            onClick={dismiss}
            className="mt-4 w-full py-2 rounded-xl text-sm font-medium shrink-0"
            style={{ background: 'var(--surface-2, #1a1a1f)', color: 'var(--text-primary, #fff)' }}
          >
            Got it
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
