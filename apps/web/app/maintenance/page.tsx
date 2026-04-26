'use client'

import { useState, useEffect } from 'react'
import { Wrench } from 'lucide-react'

export default function MaintenancePage() {
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch('/api/maintenance')
      .then((r) => r.json())
      .then((d) => {
        setNote(d.data?.note || '')
      })
      .catch(() => {})
  }, [])

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0a0a0a' }}
    >
      <div className="max-w-md w-full text-center">
        <div
          className="size-20 rounded-2xl mx-auto flex items-center justify-center mb-6"
          style={{ background: 'rgba(245,158,11,0.1)' }}
        >
          <Wrench className="size-10" style={{ color: '#f59e0b' }} />
        </div>
        <h1 className="text-2xl font-bold text-white">Under Maintenance</h1>
        <p
          className="mt-3 text-sm"
          style={{ color: 'var(--text-secondary, #8a8b9e)' }}
        >
          We&apos;re currently performing scheduled maintenance. Please check back later.
        </p>
        {note && (
          <div
            className="mt-4 rounded-xl p-4 text-sm text-left"
            style={{
              background: 'var(--surface-1, #111113)',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
              color: 'var(--text-secondary, #8a8b9e)',
            }}
          >
            {note}
          </div>
        )}
        <p
          className="mt-6 text-xs"
          style={{ color: 'var(--text-muted, #55566a)' }}
        >
          Cobain.dev
        </p>
      </div>
    </div>
  )
}
