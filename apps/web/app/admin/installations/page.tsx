'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Search, Monitor, ChevronDown, Loader2, Copy, Check, RefreshCw } from 'lucide-react'

/* ─── Types ─── */
interface Installation {
  id: string
  user_id: string
  install_id?: string
  vps_ip?: string
  windows_version?: string
  rdp_type?: string
  rdp_password?: string
  status: string
  progress_step?: number
  progress_message?: string | null
  log?: string
  error_log?: string
  created_at: string
  completed_at?: string | null
  updated_at?: string | null
  users?: { email: string }
}

/* ─── Helpers ─── */
function formatWIB(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
}

function maskIP(ip: string): string {
  const parts = ip.split('.')
  if (parts.length === 4) return `${parts[0]}.•••.•••.${parts[3]}`
  return ip.replace(/./g, '•')
}

function useElapsedTime(startTime: string, endTime?: string | null, isActive?: boolean) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const start = new Date(startTime).getTime()
    const update = () => {
      const end = endTime ? new Date(endTime).getTime() : Date.now()
      const diff = Math.max(0, Math.floor((end - start) / 1000))
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      if (h > 0) setElapsed(`${h}h ${m}m ${s}s`)
      else if (m > 0) setElapsed(`${m}m ${s}s`)
      else setElapsed(`${s}s`)
    }
    update()
    if (isActive && !endTime) {
      const interval = setInterval(update, 1000)
      return () => clearInterval(interval)
    }
  }, [startTime, endTime, isActive])
  return elapsed
}

// Clean log lines: remove URLs, file paths, IPs, and empty remnants
const cleanLogLine = (line: string): string | null => {
  let clean = line
  clean = clean.replace(/https?:\/\/[^\s\]"')]+/g, '[hidden]')
  clean = clean.replace(/\/[a-zA-Z0-9_\-\.\/]+/g, '')
  clean = clean.replace(/168\.144\.34\.139/g, '')
  clean = clean.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '')
  clean = clean.replace(/^\s*[\-\=\*]+\s*$/, '')
  clean = clean.trim()
  if (!clean || clean.match(/^\[[\d:]+\]\s*$/)) return null
  return clean
}

// Map technical log messages to professional, user-friendly ones
const professionalizeLog = (line: string): string => {
  const mappings: [RegExp, string][] = [
    [/Connecting to VPS/i, 'Initializing connection...'],
    [/Connected.*downloading/i, 'Preparing installation...'],
    [/Downloading.*installer/i, 'Downloading components...'],
    [/Download completed/i, 'Components ready'],
    [/Running installer/i, 'Starting installation...'],
    [/Executing.*scripts/i, 'Executing setup...'],
    [/Running reinstall/i, 'Configuring system...'],
    [/VPS rebooting|Verified.*preparing/i, 'System verified, proceeding...'],
    [/Verifying installation/i, 'Verifying...'],
    [/Starting installation/i, 'Installation in progress...'],
    [/Downloading Windows image/i, 'Downloading OS image...'],
    [/Writing to disk/i, 'Writing system files...'],
    [/Configuring Windows/i, 'Applying configuration...'],
    [/Finalizing/i, 'Finalizing setup...'],
    [/Starting Windows/i, 'Booting system...'],
    [/Checking RDP port/i, 'Verifying service availability...'],
    [/RDP.*ready.*Initializing/i, 'Service verified, initializing...'],
    [/Running post-install/i, 'Applying final settings...'],
    [/Installation complete/i, 'Installation complete ✓'],
    [/Installation in progress/i, 'Processing...'],
    [/SSH.*lost/i, 'System transitioning...'],
    [/Disk size/i, ''],
    [/CHMOD|chmod|Binary/i, ''],
    [/stderr/i, ''],
    [/═{3,}/i, ''],
  ]
  for (const [pattern, replacement] of mappings) {
    if (pattern.test(line)) return replacement
  }
  return line
}

// Parse RDP password from progress message logs
const parsePasswordFromLogs = (progressMessage: string | null): string | null => {
  if (!progressMessage) return null
  const lines = progressMessage.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/Password:\s*(.+)/i)
    if (match) return match[1].trim()
  }
  return null
}

/* ─── Status Config ─── */
const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string; pulse?: boolean }> = {
  pending: { color: 'bg-gray-500/10 text-gray-400', dot: 'bg-gray-400', label: 'Pending' },
  in_progress: { color: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-400', label: 'In Progress', pulse: true },
  installing: { color: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-400', label: 'Installing', pulse: true },
  processing: { color: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-400', label: 'Processing', pulse: true },
  completed: { color: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-400', label: 'Completed' },
  failed: { color: 'bg-red-500/10 text-red-400', dot: 'bg-red-400', label: 'Failed' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.color)}>
      <span className={cn('size-1.5 rounded-full', cfg.dot, cfg.pulse && 'animate-pulse')} />
      {cfg.label}
    </span>
  )
}

function ProgressBar({ step, total, status }: { step: number; total: number; status: string }) {
  const pct = Math.min(Math.round((step / total) * 100), 100)
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            status === 'completed' ? 'bg-emerald-500' : status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-xs px-2 py-0.5 rounded transition-colors"
      style={{ background: copied ? 'rgba(34,197,94,0.2)' : 'var(--surface-2)', color: copied ? '#22c55e' : 'var(--text-muted)' }}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

/* ─── Installation Card ─── */
function InstallationCard({ inst, expanded, onToggle }: { inst: Installation; expanded: boolean; onToggle: () => void }) {
  const isActive = ['in_progress', 'installing', 'processing', 'pending'].includes(inst.status)
  const cfg = STATUS_CONFIG[inst.status] || STATUS_CONFIG.pending
  const progressStep = inst.progress_step ?? 0
  const progressMessage = inst.progress_message ?? ''

  const elapsed = useElapsedTime(
    inst.created_at,
    inst.status === 'completed' ? inst.completed_at :
    inst.status === 'failed' ? (inst.updated_at ?? inst.completed_at) : null,
    isActive
  )

  return (
    <div className="rounded-xl overflow-hidden transition-colors" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('size-2 rounded-full shrink-0', cfg.dot, cfg.pulse && 'animate-pulse')} />
          <span className="text-sm font-medium text-white truncate font-mono">{inst.vps_ip ? maskIP(inst.vps_ip) : '—'}</span>
          <span className="text-xs text-gray-600 hidden sm:inline">{inst.windows_version || '—'}</span>
          {inst.users?.email && (
            <span className="text-xs hidden md:inline truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
              {inst.users.email}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {elapsed && (
            <span className="text-xs font-mono text-gray-500 hidden sm:inline">⏱ {elapsed}</span>
          )}
          <span className="text-xs text-gray-600 hidden lg:inline">{formatWIB(inst.created_at)}</span>
          <StatusBadge status={inst.status} />
          <ChevronDown className={cn('size-4 text-gray-600 transition-transform duration-200', expanded && 'rotate-180')} />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--border-subtle)' }}>
          {/* Progress */}
          {isActive && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span className="truncate mr-4">
                  {(progressMessage?.split('\n').filter((l: string) => l.trim()).pop() || 'Waiting...').replace(/:\s*\d+%$/, '')}
                </span>
                <span className="shrink-0">{Math.min(progressStep || 0, 100)}%</span>
              </div>
              <ProgressBar step={progressStep} total={100} status={inst.status} />
            </div>
          )}

          {/* Log Box */}
          {progressMessage && progressMessage.includes('\n') && (
            <div>
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Installation Logs</div>
              <div
                className="rounded-xl p-4 font-mono text-xs leading-relaxed overflow-auto max-h-64 space-y-0.5"
                style={{
                  background: '#0d0d0d',
                  border: '1px solid var(--border-subtle)',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--surface-3, #374151) transparent'
                }}
                ref={(el) => {
                  if (el && isActive) el.scrollTop = el.scrollHeight
                }}
              >
                {progressMessage.split('\n').map((line: string, i: number) => {
                  const cleaned = cleanLogLine(line.trim())
                  if (!cleaned) return null
                  const trimmed = professionalizeLog(cleaned)
                  if (!trimmed) return null

                  let color = 'var(--text-secondary, #9ca3af)'
                  let bullet = '•'

                  if (trimmed.startsWith('✅') || trimmed.includes('success') || trimmed.includes('complete') || trimmed.includes('Complete')) {
                    color = 'var(--green, #22c55e)'; bullet = '✓'
                  } else if (trimmed.startsWith('❌') || trimmed.includes('error') || trimmed.includes('Error') || trimmed.includes('failed') || trimmed.includes('Failed')) {
                    color = 'var(--rose, #f43f5e)'; bullet = '✗'
                  } else if (trimmed.startsWith('⚠️') || trimmed.includes('warning') || trimmed.includes('Warning')) {
                    color = 'var(--amber, #f59e0b)'; bullet = '!'
                  } else if (trimmed.startsWith('📥') || trimmed.includes('download') || trimmed.includes('Download')) {
                    color = '#60a5fa'; bullet = '↓'
                  } else if (trimmed.startsWith('🔐') || trimmed.includes('decrypt') || trimmed.includes('Decrypt') || trimmed.includes('encrypt')) {
                    color = '#c084fc'; bullet = '🔑'
                  } else if (trimmed.startsWith('🔄') || trimmed.includes('Verified') || trimmed.includes('verified') || trimmed.includes('Verifying') || trimmed.includes('verifying')) {
                    color = '#fbbf24'; bullet = '↻'
                  } else if (trimmed.startsWith('🚀') || trimmed.startsWith('🎯') || trimmed.startsWith('⚙️')) {
                    color = 'var(--q-accent, #00f5d4)'; bullet = '▸'
                  } else if (trimmed.startsWith('═══')) {
                    return (
                      <div key={i} className="py-1" style={{ color: 'var(--border-subtle, #374151)' }}>
                        {'─'.repeat(40)}
                      </div>
                    )
                  } else if (trimmed.startsWith('[Monitor]')) {
                    color = 'var(--text-muted, #6b7280)'; bullet = '◦'
                  }

                  return (
                    <div key={i} className="flex gap-2 py-px hover:bg-white/[0.02] px-1 rounded" style={{ color }}>
                      <span className="select-none opacity-60 w-3 text-center flex-shrink-0">{bullet}</span>
                      <span className="break-all">{trimmed.replace(/^[✅❌⚠️📥🔐🔄🚀🎯⚙️📡📋📊🔨📁📦🔌⏳🎉🌐👤🔑]\s?/, '')}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">IP:</span>
              <span className="text-white font-mono text-xs">{inst.vps_ip || '—'}</span>
              {inst.vps_ip && <CopyBtn value={inst.vps_ip} />}
            </div>
            {inst.install_id && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Install ID:</span>
                <span className="text-gray-400 font-mono text-xs">{inst.install_id}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">OS:</span>{' '}
              <span className="text-white">{inst.windows_version || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Type:</span>{' '}
              <span className="text-white capitalize">{inst.rdp_type || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">User:</span>{' '}
              <span className="text-gray-400 text-xs">{inst.users?.email || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Started:</span>{' '}
              <span className="text-gray-400">{formatWIB(inst.created_at)}</span>
            </div>
          </div>

          {/* Credentials if completed */}
          {inst.status === 'completed' && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <div className="text-xs font-medium text-emerald-400 mb-3">RDP Credentials</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-muted)' }}>Host</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white">{inst.vps_ip}:22</span>
                    <CopyBtn value={`${inst.vps_ip}:22`} />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-muted)' }}>Username</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white">administrator</span>
                    <CopyBtn value="administrator" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-muted)' }}>Password</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white">{parsePasswordFromLogs(progressMessage) || '—'}</span>
                    <CopyBtn value={parsePasswordFromLogs(progressMessage) || ''} />
                  </div>
                </div>
              </div>
              {elapsed && (
                <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Total installation time: {elapsed}
                </div>
              )}
            </div>
          )}

          {/* Error if failed */}
          {inst.status === 'failed' && (progressMessage || inst.error_log) && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <div className="text-xs text-red-400 font-medium mb-1">Error</div>
              <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">
                {inst.error_log || cleanLogLine(progressMessage || '') || progressMessage}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Main Page ─── */
export default function AdminInstallationsPage() {
  const [installations, setInstallations] = useState<Installation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('limit', '50')
      const res = await fetch(`/api/admin/installations?${params}`)
      const json = await res.json()
      if (json.success) setInstallations(json.data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  // Initial fetch + refetch on search change
  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  // Poll every 3s
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchData(false), 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  const activeCount = installations.filter(
    (i) => ['in_progress', 'installing', 'processing', 'pending'].includes(i.status)
  ).length

  return (
    <div className="space-y-3 lg:space-y-4 max-w-7xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">Installations</h1>
          <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Monitor all RDP installations
            {activeCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-blue-400">
                <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
                {activeCount} active
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-800/60"
          title="Refresh"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Install ID..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white text-sm placeholder:text-gray-600 outline-none transition-all focus:ring-1"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
        )}
      </div>

      {/* Content */}
      {loading && installations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-gray-600" />
        </div>
      ) : installations.length === 0 ? (
        <div className="rounded-xl py-10 lg:py-16 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <Monitor className="size-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {debouncedSearch ? `No installations found for "${debouncedSearch}"` : 'No installations found'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {installations.map((inst) => (
            <InstallationCard
              key={inst.id}
              inst={inst}
              expanded={expandedId === inst.id}
              onToggle={() => setExpandedId(expandedId === inst.id ? null : inst.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
