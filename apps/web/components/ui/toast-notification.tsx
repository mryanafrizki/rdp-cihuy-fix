'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number // ms, default 5000
}

let addToastFn: ((toast: Omit<Toast, 'id'>) => void) | null = null

// Global function to show toast from anywhere
export function showToast(message: string, type: ToastType = 'info', duration = 5000) {
  addToastFn?.({ message, type, duration })
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    addToastFn = (toast) => {
      const id = Date.now().toString()
      setToasts(prev => [...prev, { ...toast, id }])
    }
    return () => { addToastFn = null }
  }, [])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDone={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ toast, onDone }: { toast: Toast, onDone: () => void }) {
  const duration = toast.duration || 5000
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        onDone()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [duration, onDone])

  const colors = {
    success: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)', bar: '#22c55e', icon: '#22c55e' },
    error: { bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.3)', bar: '#f43f5e', icon: '#f43f5e' },
    info: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', bar: '#3b82f6', icon: '#3b82f6' },
  }
  const c = colors[toast.type]
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? XCircle : Info

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      className="rounded-xl overflow-hidden backdrop-blur-md"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className="size-5 flex-shrink-0 mt-0.5" style={{ color: c.icon }} />
        <p className="text-sm text-white flex-1">{toast.message}</p>
        <button onClick={onDone} className="text-white/40 hover:text-white/70 text-xs">✕</button>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 w-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <motion.div
          className="h-full"
          style={{ background: c.bar, width: `${progress}%` }}
          transition={{ duration: 0.05 }}
        />
      </div>
    </motion.div>
  )
}
