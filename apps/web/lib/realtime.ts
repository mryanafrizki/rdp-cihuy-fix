'use client'

import { useState, useEffect, useRef } from 'react'

interface InstallationProgress {
  id: string
  status: string
  step: number
  message: string | null
  progress_step: number
  progress_message: string | null
  vps_ip: string
  windows_version: string
  rdp_password?: string | null
  completed_at?: string | null
}

export function useInstallationProgress(installationId: string) {
  const [progress, setProgress] = useState<InstallationProgress | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!installationId) {
      setProgress(null)
      return
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/installations/${installationId}`)
        if (res.ok) {
          const json = await res.json()
          const raw = json.data || json
          setProgress({
            ...raw,
            step: raw.progress_step ?? raw.step ?? 0,
            message: raw.progress_message ?? raw.message ?? null,
          })
          if (raw?.status === 'completed' || raw?.status === 'failed') {
            if (intervalRef.current) clearInterval(intervalRef.current)
          }
        }
      } catch {
        // Polling error, continue
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 3000)

    // Refresh immediately when tab becomes visible (browsers throttle background intervals)
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [installationId])

  return { progress }
}
