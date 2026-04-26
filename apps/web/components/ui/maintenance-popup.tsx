'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

export function MaintenancePopup() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [data, setData] = useState<{
    enabled: boolean
    scope: string | string[]
    note?: string
    show_popup: boolean
  } | null>(null)

  useEffect(() => {
    fetch('/api/maintenance')
      .then((r) => r.json())
      .then((d) => {
        if (!d.data?.enabled || !d.data?.show_popup) return

        const scope = Array.isArray(d.data.scope) ? d.data.scope : [d.data.scope]

        let shouldShow = false
        if (scope.includes('all')) shouldShow = true
        else if (scope.includes('topup') && pathname?.includes('/topup')) shouldShow = true
        else if (scope.includes('install') && (pathname?.includes('/order') || pathname?.includes('/installations'))) shouldShow = true

        if (shouldShow) {
          setData(d.data)
          setShow(true)
        } else {
          setShow(false)
        }
      })
      .catch(() => {})
  }, [pathname]) // Re-run on every navigation

  const handleDismiss = () => {
    setShow(false)
    // If scope is 'all', redirect to landing page
    if (data?.scope && (Array.isArray(data.scope) ? data.scope.includes('all') : data.scope === 'all')) {
      window.location.href = '/'
    }
  }

  if (!show || !data) return null

  // Handle scope as both string and array
  const scope = Array.isArray(data.scope) ? data.scope : [data.scope]
  const scopeMessage = scope.includes('all')
    ? 'The system is currently under full maintenance.'
    : scope.includes('install') && scope.includes('topup')
      ? 'RDP installation and top-up are temporarily unavailable.'
      : scope.includes('install')
        ? 'RDP installation is temporarily unavailable.'
        : scope.includes('topup')
          ? 'Top-up is temporarily unavailable.'
          : 'Some features are under maintenance.'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="max-w-sm w-full rounded-2xl p-6"
            style={{
              background: 'var(--surface-1, #111113)',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className="size-5"
                  style={{ color: 'var(--amber, #f59e0b)' }}
                />
                <h3 className="text-lg font-semibold text-white">
                  Maintenance Notice
                </h3>
              </div>
              <button
                onClick={handleDismiss}
                style={{ color: 'var(--text-muted, #55566a)' }}
              >
                <X className="size-4" />
              </button>
            </div>
            <p
              className="mt-3 text-sm"
              style={{ color: 'var(--text-secondary, #8a8b9e)' }}
            >
              {scopeMessage}
            </p>
            {data.note && (
              <p
                className="mt-2 text-sm"
                style={{ color: 'var(--text-muted, #55566a)' }}
              >
                {data.note}
              </p>
            )}
            <button
              onClick={handleDismiss}
              className="mt-4 w-full py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'var(--surface-2, #1a1a1f)',
                color: 'var(--text-primary, #fff)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              Understood
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
