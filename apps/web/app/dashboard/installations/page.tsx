'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useInstallationProgress } from '@/lib/realtime'
import { showToast } from '@/components/ui/toast-notification'
import { Loader2, ChevronDown, Monitor, Inbox, RefreshCw, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'

type InstallationStatus = 'pending' | 'in_progress' | 'installing' | 'completed' | 'failed'

interface Installation {
  id: string
  install_id?: string
  vps_ip: string
  windows_version: string
  rdp_type: string
  status: InstallationStatus
  progress_step: number
  progress_message: string | null
  created_at: string
  completed_at?: string | null
  updated_at?: string | null
}

function formatWIB(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

      if (h > 0) {
        setElapsed(`${h}h ${m}m ${s}s`)
      } else if (m > 0) {
        setElapsed(`${m}m ${s}s`)
      } else {
        setElapsed(`${s}s`)
      }
    }

    update()

    if (isActive && !endTime) {
      const interval = setInterval(update, 1000)
      return () => clearInterval(interval)
    }
  }, [startTime, endTime, isActive])

  return elapsed
}

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string; pulse?: boolean }> = {
  pending: { color: 'bg-gray-500/10 text-gray-400', dot: 'bg-gray-400', label: 'Pending' },
  in_progress: { color: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-400', label: 'In Progress', pulse: true },
  installing: { color: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-400', label: 'Installing', pulse: true },
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="text-gray-600 hover:text-gray-400 transition-colors ml-1.5" title="Copy">
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  )
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-xs px-2 py-0.5 rounded" style={{ background: copied ? 'rgba(34,197,94,0.2)' : 'var(--surface-2)', color: copied ? '#22c55e' : 'var(--text-muted)' }}>
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

// Clean log lines: remove URLs, file paths, IPs, and empty remnants
const cleanLogLine = (line: string): string | null => {
  let clean = line;
  // Remove URLs
  clean = clean.replace(/https?:\/\/[^\s\]"')]+/g, '[hidden]');
  // Remove ALL file paths (anything starting with /)
  clean = clean.replace(/\/[a-zA-Z0-9_\-\.\/]+/g, '');
  // Remove IP of ubuntu VPS (168.144.34.139)
  clean = clean.replace(/168\.144\.34\.139/g, '');
  // Remove empty brackets/parens left after removal
  clean = clean.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '');
  // Remove lines that are now empty or just whitespace/punctuation
  clean = clean.replace(/^\s*[\-\=\*]+\s*$/, '');
  // Trim
  clean = clean.trim();
  // Skip empty lines or lines that are just timestamps
  if (!clean || clean.match(/^\[[\d:]+\]\s*$/)) return null;
  return clean;
};

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
  ];

  for (const [pattern, replacement] of mappings) {
    if (pattern.test(line)) {
      return replacement;
    }
  }
  return line;
};

// Strip ANSI escape codes from string
const stripAnsi = (str: string): string => str.replace(/\x1b\[[0-9;]*m|\[\d+m/g, '')

// Parse RDP password from progress message logs
const parsePasswordFromLogs = (msg: string | null): string | null => {
  if (!msg) return null
  const cleaned = stripAnsi(msg)
  const lines = cleaned.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    // Match "Password: xxx" with any prefix (emoji, timestamp, etc)
    const match = lines[i].match(/Password[:\s]+(\S+)/i)
    if (match && match[1] && match[1] !== '[REDACTED]' && match[1] !== '—') {
      return match[1].trim()
    }
  }
  return null
};

/** Realtime-aware card for a single installation */
function InstallationCard({ installation: initial, osMap }: { installation: Installation; osMap: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false)
  const isActive = initial.status === 'in_progress' || initial.status === 'installing' || initial.status === 'pending'

  // Subscribe to realtime updates for active installations
  const { progress } = useInstallationProgress(isActive ? initial.id : '')

  // Merge realtime data with initial
  const status = progress?.status ?? initial.status
  const progressStep = progress?.step ?? initial.progress_step ?? 0
  const progressMessage = stripAnsi(progress?.message ?? initial.progress_message ?? '')
  // For password, always use raw DB value (not realtime cleaned version)
  const rawProgressMessage = initial.progress_message || ''

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending

  const elapsed = useElapsedTime(
    initial.created_at,
    status === 'completed' ? initial.completed_at :
    status === 'failed' ? (initial.updated_at ?? initial.completed_at) : null,
    status === 'in_progress' || status === 'installing' || status === 'pending'
  )

  return (
    <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl overflow-hidden transition-colors hover:border-gray-700/60">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer hover:bg-gray-800/20 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('size-2 rounded-full shrink-0', cfg.dot, cfg.pulse && 'animate-pulse')} />
          <span className="text-sm font-medium text-white truncate">{initial.vps_ip}</span>
          <span className="text-xs text-gray-600 hidden sm:inline">{osMap[initial.windows_version] || initial.windows_version}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {elapsed && (
            <span className="text-xs font-mono text-gray-500">
              {elapsed}
            </span>
          )}
          <span className="text-xs text-gray-600 hidden md:inline">{formatWIB(initial.created_at)}</span>
          <StatusBadge status={status} />
          <ChevronDown
            className={cn('size-4 text-gray-600 transition-transform duration-200', (expanded || status === 'in_progress' || status === 'installing') && 'rotate-180')}
          />
        </div>
      </button>

      {/* Expanded detail - always visible for active installations */}
      {(expanded || status === 'in_progress' || status === 'installing') && (
        <div className="border-t border-gray-800/60 p-4 space-y-4">
          {/* Progress */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span className="truncate mr-4">{(progressMessage?.split('\n').filter((l: string) => l.trim()).pop() || 'Waiting...').replace(/:\s*\d+%$/, '')}</span>
              <span className="shrink-0">{Math.min(progressStep || 0, 100)}%</span>
            </div>
            <ProgressBar step={progressStep} total={100} status={status} />
          </div>

          {/* Log Box */}
          {progressMessage && progressMessage.includes('\n') && (
            <div className="mt-4">
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted, #6b7280)' }}>
                Installation Logs
              </div>
              <div 
                className="rounded-xl p-4 font-mono text-xs leading-relaxed overflow-auto max-h-64 space-y-0.5"
                style={{ 
                  background: '#0d0d0d', 
                  border: '1px solid var(--border-subtle, #1f2937)',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--surface-3, #374151) transparent'
                }}
                ref={(el) => {
                  // Auto-scroll to bottom when new logs arrive for active installations
                  if (el && (status === 'in_progress' || status === 'installing')) {
                    el.scrollTop = el.scrollHeight;
                  }
                }}
              >
                {progressMessage.split('\n').map((line: string, i: number) => {
                  const cleaned = cleanLogLine(line.trim());
                  if (!cleaned) return null;
                  const trimmed = professionalizeLog(cleaned);
                  if (!trimmed) return null;
                  
                  // Color code based on content
                  let color = 'var(--text-secondary, #9ca3af)'; // default gray
                  let bullet = '•';
                  
                  if (trimmed.startsWith('✅') || trimmed.includes('success') || trimmed.includes('complete') || trimmed.includes('Complete')) {
                    color = 'var(--green, #22c55e)';
                    bullet = '✓';
                  } else if (trimmed.startsWith('❌') || trimmed.includes('error') || trimmed.includes('Error') || trimmed.includes('failed') || trimmed.includes('Failed')) {
                    color = 'var(--rose, #f43f5e)';
                    bullet = '✗';
                  } else if (trimmed.startsWith('⚠️') || trimmed.includes('warning') || trimmed.includes('Warning')) {
                    color = 'var(--amber, #f59e0b)';
                    bullet = '!';
                  } else if (trimmed.startsWith('📥') || trimmed.includes('download') || trimmed.includes('Download')) {
                    color = '#60a5fa'; // blue
                    bullet = '↓';
                  } else if (trimmed.startsWith('🔐') || trimmed.includes('decrypt') || trimmed.includes('Decrypt') || trimmed.includes('encrypt')) {
                    color = '#c084fc'; // purple
                    bullet = '*';
                  } else if (trimmed.startsWith('🔄') || trimmed.includes('Verified') || trimmed.includes('verified') || trimmed.includes('Verifying') || trimmed.includes('verifying')) {
                    color = '#fbbf24'; // yellow
                    bullet = '↻';
                  } else if (trimmed.startsWith('🚀') || trimmed.startsWith('🎯') || trimmed.startsWith('⚙️')) {
                    color = 'var(--q-accent, #00f5d4)';
                    bullet = '▸';
                  } else if (trimmed.startsWith('═══')) {
                    // Section divider
                    return (
                      <div key={i} className="py-1" style={{ color: 'var(--border-subtle, #374151)' }}>
                        {'─'.repeat(40)}
                      </div>
                    );
                  } else if (trimmed.startsWith('[Monitor]')) {
                    color = 'var(--text-muted, #6b7280)';
                    bullet = '◦';
                  }
                  
                  return (
                    <div key={i} className="flex gap-2 py-px hover:bg-white/[0.02] px-1 rounded" style={{ color }}>
                      <span className="select-none opacity-60 w-3 text-center flex-shrink-0">{bullet}</span>
                      <span className="break-all">{trimmed.replace(/^[✅❌⚠️📥🔐🔄🚀🎯⚙️📡📋📊🔨📁📦🔌⏳🎉🌐👤🔑]\s?/, '')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VPS Details grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">IP:</span>
              <span className="text-white font-mono text-xs">{initial.vps_ip}</span>
              <CopyButton text={initial.vps_ip} />
            </div>
            <div>
              <span className="text-gray-500">Port:</span>{' '}
              <span className="text-white font-mono text-xs">22</span>
            </div>
            <div>
              <span className="text-gray-500">OS:</span>{' '}
              <span className="text-white">{osMap[initial.windows_version] || initial.windows_version}</span>
            </div>
            <div>
              <span className="text-gray-500">Type:</span>{' '}
              <span className="text-white capitalize">{initial.rdp_type}</span>
            </div>
            {initial.install_id && (
              <div className="col-span-2">
                <span className="text-gray-500">Install ID:</span>{' '}
                <span className="text-gray-400 font-mono text-xs">{initial.install_id}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Started:</span>{' '}
              <span className="text-gray-400">{formatWIB(initial.created_at)}</span>
            </div>
          </div>

          {/* Credentials if completed */}
          {status === 'completed' && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <div className="text-xs font-medium text-emerald-400 mb-3">RDP Credentials</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-muted)' }}>Host</span>
                  <div className="flex items-center gap-2">
<span className="font-mono text-white">{initial.vps_ip}:22</span>
<CopyBtn value={`${initial.vps_ip}:22`} />
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
                    <span className="font-mono text-white">{parsePasswordFromLogs(rawProgressMessage) || 'Not available'}</span>
                    <CopyBtn value={parsePasswordFromLogs(rawProgressMessage) || ''} />
                  </div>
                </div>
                {initial.rdp_type === 'docker' && (
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-muted)' }}>Web Viewer</span>
                    <div className="flex items-center gap-2">
                      <a href={`http://${initial.vps_ip}:8006`} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
                        http://{initial.vps_ip}:8006
                      </a>
                      <CopyBtn value={`http://${initial.vps_ip}:8006`} />
                    </div>
                  </div>
                )}
              </div>
              {elapsed && (
                <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Total installation time: {elapsed}
                </div>
              )}
            </div>
          )}

          {/* Error if failed */}
          {status === 'failed' && progressMessage && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <div className="text-xs text-red-400 font-medium mb-2">Error Details</div>
              <div 
                className="rounded-lg p-3 font-mono text-xs leading-relaxed overflow-auto max-h-48 space-y-0.5"
                style={{ background: '#0d0d0d', border: '1px solid rgba(244,63,94,0.15)' }}
              >
                {progressMessage.split('\n').map((line: string, i: number) => {
                  const trimmed = line.trim()
                  if (!trimmed) return null
                  
                  let color = '#f87171' // default red-ish
                  let bullet = '✗'
                  if (trimmed.startsWith('---') || trimmed.startsWith('===')) {
                    return <div key={i} className="py-0.5" style={{ color: 'rgba(244,63,94,0.3)' }}>{'─'.repeat(40)}</div>
                  }
                  if (trimmed.toLowerCase().includes('error') || trimmed.toLowerCase().includes('failed') || trimmed.toLowerCase().includes('fatal')) {
                    color = '#f43f5e'
                    bullet = '✗'
                  } else if (trimmed.startsWith('[')) {
                    color = '#fb923c' // orange for timestamps
                    bullet = '•'
                  } else {
                    color = '#fca5a5' // lighter red for info lines
                    bullet = '•'
                  }
                  
                  return (
                    <div key={i} className="flex gap-2 py-px" style={{ color }}>
                      <span className="select-none opacity-50 w-3 text-center flex-shrink-0">{bullet}</span>
                      <span className="break-all">{trimmed}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Docker OS display names (not in DB, hardcoded in frontend)
const DOCKER_OS_NAMES: Record<string, string> = {
  docker_win11_pro: 'Windows 11 Pro', docker_win11_ltsc: 'Windows 11 LTSC', docker_win11_ent: 'Windows 11 Enterprise',
  docker_win10_pro: 'Windows 10 Pro', docker_win10_ltsc: 'Windows 10 LTSC', docker_win10_ent: 'Windows 10 Enterprise',
  docker_win81_ent: 'Windows 8.1 Enterprise', docker_win7: 'Windows 7 Ultimate',
  docker_vista: 'Windows Vista Ultimate', docker_xp: 'Windows XP Professional', docker_2000: 'Windows 2000 Professional',
  docker_srv2025: 'Windows Server 2025', docker_srv2022: 'Windows Server 2022', docker_srv2019: 'Windows Server 2019',
  docker_srv2016: 'Windows Server 2016', docker_srv2012: 'Windows Server 2012', docker_srv2008: 'Windows Server 2008',
  docker_srv2003: 'Windows Server 2003',
  docker_tiny11: 'Tiny11 (Lightweight Win11)',
}

function useOsNames() {
  const [osMap, setOsMap] = useState<Record<string, string>>(DOCKER_OS_NAMES)
  useEffect(() => {
    fetch('/api/public/os-versions').then(r => r.json()).then(d => {
      const map: Record<string, string> = { ...DOCKER_OS_NAMES }
      for (const os of (d.data || [])) map[os.id] = os.name
      setOsMap(map)
    }).catch(() => {})
  }, [])
  return osMap
}

const PER_PAGE = 10

export default function InstallationsPage() {
  const [installations, setInstallations] = useState<Installation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevStatusRef = useRef<Record<string, string>>({})
  const osMap = useOsNames()

  const fetchInstallations = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PER_PAGE) })
      const res = await fetch(`/api/installations?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch')

      // Detect status changes for toast
      const newData: Installation[] = json.data || [];
      newData.forEach((inst: Installation) => {
        const prev = prevStatusRef.current[inst.id];
        if (prev && prev !== inst.status) {
          if (inst.status === 'completed') {
            showToast(`RDP installation complete: ${inst.vps_ip}`, 'success');
          } else if (inst.status === 'failed') {
            showToast(`Installation failed: ${inst.vps_ip}`, 'error');
          }
        }
        prevStatusRef.current[inst.id] = inst.status;
      });

      setInstallations(newData)
      if (json.pagination) {
        setTotal(json.pagination.total)
        setTotalPages(Math.max(1, Math.ceil(json.pagination.total / PER_PAGE)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch installations')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchInstallations(true)
  }, [fetchInstallations])

  // Poll every 5s ONLY if there are active installations on current page
  useEffect(() => {
    const hasActive = installations.some(i => ['pending', 'in_progress', 'installing'].includes(i.status))
    if (hasActive) {
      intervalRef.current = setInterval(() => fetchInstallations(false), 5000)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchInstallations(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible)
    };
  }, [fetchInstallations, installations])

  const activeCount = installations.filter(
    (i) => i.status === 'in_progress' || i.status === 'installing' || i.status === 'pending'
  ).length

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Installations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Track your RDP installations
            {activeCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-blue-400">
                <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
                {activeCount} active
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchInstallations(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-800/60"
          title="Refresh"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Content */}
      {loading && installations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-gray-600" />
        </div>
      ) : error ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => fetchInstallations(true)}
            className="mt-3 text-xs text-red-400/70 hover:text-red-300 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : installations.length === 0 ? (
        <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl py-16 text-center">
          <Monitor className="size-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No installations yet</p>
          <p className="text-xs text-gray-600 mt-1">Create your first RDP from the Order page</p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {installations.map((inst) => (
            <InstallationCard key={inst.id} installation={inst} osMap={osMap} />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-500">{total} installations</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dot-${i}`} className="px-1 text-xs text-gray-600">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'min-w-[28px] h-7 rounded-md text-xs font-medium transition-colors',
                        p === page
                          ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800'
                      )}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
