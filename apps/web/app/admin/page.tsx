'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, CheckCircle2, XCircle, TrendingDown, Wallet, Search, Loader2, ChevronDown, ChevronUp, Cloud, ArrowUpRight, ArrowDownLeft, RotateCcw } from 'lucide-react'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

/* ─── helpers ─── */
function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

function formatWIB(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
}

/* ─── types ─── */
interface MonthlyData {
  month: string
  success: number
  failed: number
  spent: number
}

interface StatsData {
  totalUsers: number
  totalSuccess: number
  totalFailed: number
  totalSpent: number
  totalBalance: number
  totalCloudAccounts: number
  totalCloudDroplets: number
  monthly: MonthlyData[]
}

interface ActivityTransaction {
  id: string
  user_id: string
  type: string
  amount: number
  status: string
  payment_id?: string
  updated_at: string
  created_at: string
  users: { email: string }
}

interface ActivityInstallation {
  id: string
  user_id: string
  install_id?: string
  status: string
  vps_ip?: string
  windows_version?: string
  log?: string
  error_log?: string
  updated_at: string
  created_at: string
  users: { email: string }
}

/* ─── useIsMobile hook (SSR-safe: defaults to false to match server render) ─── */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches
  })
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

/* ─── MonthlyChart (Recharts: success, failed, spent) ─── */
function MonthlyChart({ data }: { data: { month: string, success: number, failed: number, spent: number }[] }) {
  const isMobile = useIsMobile()
  if (!data.length) return null

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null
    return (
      <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
        <div className="font-medium text-white mb-2">{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 py-0.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
            <span className="text-white font-medium">
              {p.name === 'Spent' ? `Rp ${(p.value / 1000).toFixed(0)}K` : p.value}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl p-4 lg:p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between mb-3 lg:mb-4">
        <h3 className="text-xs lg:text-sm font-medium text-white">Monthly Overview</h3>
        <div className="flex gap-2 lg:gap-4 text-[10px] lg:text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 rounded-full bg-emerald-400 inline-block" />Success</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 rounded-full bg-red-400 inline-block" />Failed</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 rounded-full inline-block" style={{ background: '#00f5d4' }} />Spent</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 150 : 180}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: isMobile ? -25 : -20, bottom: 5 }}>
          <defs>
            <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradSpent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#00f5d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: isMobile ? 9 : 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: isMobile ? 9 : 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
          <Area type="monotone" dataKey="success" name="Success" stroke="#22c55e" strokeWidth={2} fill="url(#gradSuccess)" dot={{ r: 3, fill: '#22c55e' }} activeDot={{ r: 5 }} />
          <Area type="monotone" dataKey="failed" name="Failed" stroke="#f43f5e" strokeWidth={2} fill="url(#gradFailed)" dot={{ r: 3, fill: '#f43f5e' }} activeDot={{ r: 5 }} />
          <Area type="monotone" dataKey="spent" name="Spent" stroke="#00f5d4" strokeWidth={2} fill="url(#gradSpent)" dot={{ r: 3, fill: '#00f5d4' }} activeDot={{ r: 5 }} strokeDasharray="5 5" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ─── HorizontalBarChart ─── */
function HorizontalBarChart({ data }: { data: { label: string; value: number; color: string; formatted: string }[] }) {
  const maxVal = Math.max(...data.map(d => d.value), 1)
  
  return (
    <div className="rounded-xl p-4 lg:p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <h3 className="text-xs lg:text-sm font-medium text-white mb-3">All Time Statistics</h3>
      <div className="space-y-3">
        {data.map(d => (
          <div key={d.label}>
            <div className="flex justify-between text-[11px] lg:text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
              <span className="font-medium text-white">{d.formatted}</span>
            </div>
            <div className="h-1.5 lg:h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full transition-all duration-500" 
                style={{ width: `${(d.value / maxVal) * 100}%`, background: d.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Status helpers ─── */
function getTxStatusLabel(status: string) {
  switch (status) {
    case 'completed': return 'Success'
    case 'failed': return 'Failed'
    case 'expired': return 'Expired'
    case 'cancelled': return 'Cancelled'
    case 'pending': return 'Pending'
    default: return status
  }
}

function getTxStatusColor(status: string) {
  switch (status) {
    case 'completed': return { bg: 'rgba(34,197,94,0.1)', text: '#22c55e' }
    case 'failed': return { bg: 'rgba(244,63,94,0.1)', text: '#f43f5e' }
    case 'expired': return { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' }
    case 'cancelled': return { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' }
    case 'pending': return { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' }
    default: return { bg: 'rgba(255,255,255,0.05)', text: 'var(--text-muted)' }
  }
}

/* ─── ActivityItem ─── */
function ActivityItem({ item, isOwner }: {
  item: {
    id: string
    type: 'topup' | 'order' | 'refund' | 'install' | 'cloud'
    action?: string
    details?: any
    status: string
    amount?: number
    vps_ip?: string
    windows_version?: string
    email: string
    log?: string
    error_log?: string
    updated_at: string
    install_id?: string
  }
  isOwner?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const isFailed = item.type === 'install' && item.status === 'failed'
  const hasLogs = isFailed && (item.log || item.error_log)
  const txStatusColor = getTxStatusColor(item.status)
  const isTxNonCompleted = (item.type === 'topup' || item.type === 'order' || item.type === 'refund') && item.status !== 'completed'

  return (
    <div
      className="transition-colors"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div
        className="flex items-center justify-between py-2.5 px-1"
        style={{ cursor: hasLogs ? 'pointer' : 'default' }}
        onClick={() => hasLogs && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {item.type === 'topup' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: isTxNonCompleted ? txStatusColor.bg : 'rgba(0,245,212,0.08)' }}>
              {item.status === 'pending' ? <Loader2 className="size-3.5 animate-spin" style={{ color: txStatusColor.text }} /> :
                <ArrowUpRight className="size-3.5" style={{ color: isTxNonCompleted ? txStatusColor.text : 'var(--q-accent)' }} />}
            </div>
          )}
          {item.type === 'order' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(244,63,94,0.08)' }}>
              <ArrowDownLeft className="size-3.5" style={{ color: '#f43f5e' }} />
            </div>
          )}
          {item.type === 'refund' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: isTxNonCompleted ? txStatusColor.bg : 'rgba(245,158,11,0.08)' }}>
              <RotateCcw className="size-3.5" style={{ color: isTxNonCompleted ? txStatusColor.text : 'var(--amber)' }} />
            </div>
          )}
          {item.type === 'install' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{
              background: item.status === 'completed' ? 'rgba(34,197,94,0.08)' :
                item.status === 'failed' ? 'rgba(244,63,94,0.08)' : 'rgba(59,130,246,0.08)'
            }}>
              {item.status === 'completed' ? <CheckCircle2 className="size-3.5 text-emerald-400" /> :
                item.status === 'failed' ? <XCircle className="size-3.5 text-red-400" /> :
                  <Loader2 className="size-3.5 text-blue-400 animate-spin" />}
            </div>
          )}
          {item.type === 'cloud' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.1)' }}>
              <Cloud className="size-3.5 text-blue-400" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs lg:text-sm text-white flex items-center gap-1.5 flex-wrap">
              <span>
                {item.type === 'topup' ? 'Top Up' :
                  item.type === 'order' ? 'Order RDP' :
                  item.type === 'refund' ? 'Refund' :
                  item.type === 'cloud' ? (
                    item.action === 'cloud_add_account' ? 'Added DO Account' :
                    item.action === 'cloud_add_proxy' ? 'Added Proxy' :
                    item.action === 'cloud_create_vps' ? 'Created VPS' :
                    item.action === 'cloud_create_vps_rdp' ? 'Created VPS + RDP' :
                    item.action === 'cloud_delete_vps' ? 'Deleted VPS' :
                    item.action || 'Cloud Action'
                  ) : 'Install RDP'}
              </span>
              {item.install_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                  {item.install_id}
                </span>
              )}
            </div>
            <div className="text-[10px] lg:text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {item.type === 'install' ? `${item.vps_ip || '—'} · ${item.windows_version || '—'}` :
               item.type === 'cloud' ? `${formatWIB(item.updated_at)}${item.details?.name ? ` · ${item.details.name}` : ''}` :
               formatWIB(item.updated_at)}
              {!isOwner && (
                <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>by: {item.email}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.type === 'topup' && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums" style={{
                color: item.status === 'completed' ? 'var(--green)' : txStatusColor.text,
                textDecoration: ['failed', 'expired', 'cancelled'].includes(item.status) ? 'line-through' : 'none',
              }}>+Rp {formatNumber(item.amount || 0)}</span>
              {isTxNonCompleted && (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: txStatusColor.bg, color: txStatusColor.text }}>
                  {getTxStatusLabel(item.status)}
                </span>
              )}
            </div>
          )}
          {item.type === 'order' && (
            <span className="text-sm font-medium tabular-nums" style={{ color: '#f43f5e' }}>
              -Rp {formatNumber(Math.abs(item.amount || 0))}
            </span>
          )}
          {item.type === 'refund' && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums" style={{
                color: item.status === 'completed' ? 'var(--amber)' : txStatusColor.text,
                textDecoration: ['failed', 'expired', 'cancelled'].includes(item.status) ? 'line-through' : 'none',
              }}>+Rp {formatNumber(item.amount || 0)}</span>
              {isTxNonCompleted && (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: txStatusColor.bg, color: txStatusColor.text }}>
                  {getTxStatusLabel(item.status)}
                </span>
              )}
            </div>
          )}
          {item.type === 'install' && (
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
              item.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                'bg-blue-500/10 text-blue-400'
              }`}>
              {item.status === 'completed' ? 'Complete' :
                item.status === 'failed' ? 'Failed' : 'Installing'}
            </span>
          )}
          {item.type === 'cloud' && (
            <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-blue-500/10 text-blue-400">
              Cloud
            </span>
          )}
          {hasLogs && (
            expanded ? <ChevronUp className="size-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronDown className="size-4" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </div>
      {expanded && hasLogs && (
        <div className="px-1 pb-3">
          <div className="rounded-lg p-3 text-xs font-mono overflow-x-auto" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)', maxHeight: '200px', overflowY: 'auto' }}>
            {item.error_log && (
              <div className="mb-2">
                <span className="text-red-400 font-semibold">Error:</span>
                <pre className="whitespace-pre-wrap mt-1 text-red-300/80">{item.error_log}</pre>
              </div>
            )}
            {item.log && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Log:</span>
                <pre className="whitespace-pre-wrap mt-1">{item.log}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Main Page ─── */
export default function AdminOverviewPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [ownerActivity, setOwnerActivity] = useState<any[]>([])
  const [globalActivity, setGlobalActivity] = useState<any[]>([])
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searchId, setSearchId] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [activityFilter, setActivityFilter] = useState('all')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [statsRes, activityRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/activity'),
      ])

      if (statsRes.ok) {
        const statsJson = await statsRes.json()
        setStats(statsJson.data)
      }

      if (activityRes.ok) {
        const actJson = await activityRes.json()
        const txs = (actJson.transactions || []) as ActivityTransaction[]
        const insts = (actJson.installations || []) as ActivityInstallation[]
        const allLogs = (actJson.auth_activity || []) as any[]
        const cloudFromLogs = allLogs.filter((a: any) => a.action?.startsWith('cloud_'))

        // Build unified activity items
        const allItems = [
          ...txs.map((tx) => ({
            id: tx.id,
            type: (tx.payment_id?.startsWith('refund_') ? 'refund' : tx.type === 'deduction' ? 'order' : 'topup') as 'topup' | 'order' | 'refund',
            status: tx.status,
            amount: tx.amount,
            email: tx.users?.email || '—',
            updated_at: tx.updated_at || tx.created_at,
            user_id: tx.user_id,
          })),
          ...insts.map((inst) => ({
            id: inst.id,
            type: 'install' as const,
            status: inst.status,
            vps_ip: inst.vps_ip,
            windows_version: inst.windows_version,
            email: inst.users?.email || '—',
            log: inst.log,
            error_log: inst.error_log,
            updated_at: inst.updated_at || inst.created_at,
            user_id: inst.user_id,
            install_id: inst.install_id,
          })),
          ...cloudFromLogs.map((a: any, i: number) => ({
            id: `cloud-${i}-${a.timestamp}`,
            type: 'cloud' as const,
            action: a.action,
            details: a.details,
            status: 'completed',
            email: a.email || '—',
            updated_at: a.timestamp,
          })),
        ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

        // We don't know the admin's user_id on the client, so we'll show all as global
        // and mark the first section as "Owner Activity" using a heuristic:
        // The layout already checks admin status, so we fetch the current user
        setGlobalActivity(allItems.slice(0, 20))
        // Owner activity will be populated separately
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch owner activity separately (current user's activity)
  useEffect(() => {
    async function fetchOwner() {
      try {
        // Use the dashboard API pattern - fetch from existing endpoints
        const [txRes, instRes] = await Promise.all([
          fetch('/api/admin/transactions?limit=10&status=completed'),
          fetch('/api/admin/installations?limit=10'),
        ])
        if (txRes.ok && instRes.ok) {
          const txJson = await txRes.json()
          const instJson = await instRes.json()
          // These are all transactions/installations (admin view), we'll use them as owner activity
          // Since we can't easily filter by current user from admin endpoints,
          // we'll show the most recent as "owner" section
          const ownerItems = [
            ...(txJson.data || []).slice(0, 5).map((tx: any) => ({
              id: tx.id,
              type: tx.payment_id?.startsWith('refund_') ? 'refund' as const : tx.type === 'deduction' ? 'order' as const : 'topup' as const,
              status: tx.status,
              amount: tx.amount,
              email: 'You',
              updated_at: tx.updated_at || tx.created_at,
            })),
            ...(instJson.data || []).filter((i: any) => ['in_progress', 'completed', 'failed'].includes(i.status)).slice(0, 5).map((inst: any) => ({
              id: inst.id,
              type: 'install' as const,
              status: inst.status,
              vps_ip: inst.vps_ip,
              windows_version: inst.windows_version,
              email: 'You',
              log: inst.log,
              error_log: inst.error_log,
              updated_at: inst.updated_at || inst.created_at,
              install_id: inst.install_id,
            })),
          ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10)
          setOwnerActivity(ownerItems)
        }
      } catch {
        // silent
      }
    }
    fetchOwner()
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Install ID search with debounce
  useEffect(() => {
    if (!searchId.trim()) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/admin/activity?install_id=${encodeURIComponent(searchId.trim())}`)
        if (res.ok) {
          const json = await res.json()
          setSearchResults((json.data || []).map((inst: any) => ({
            id: inst.id,
            type: 'install' as const,
            status: inst.status,
            vps_ip: inst.vps_ip,
            windows_version: inst.windows_version,
            email: inst.users?.email || '—',
            log: inst.log,
            error_log: inst.error_log,
            updated_at: inst.updated_at || inst.created_at,
            install_id: inst.install_id,
          })))
        }
      } finally {
        setSearchLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchId])

  const statCards = stats ? [
    {
      label: 'Total Users',
      value: formatNumber(stats.totalUsers),
      icon: Users,
      accent: '#00f5d4',
      accentBg: 'rgba(0,245,212,0.08)',
    },
    {
      label: 'Success Installs',
      value: formatNumber(stats.totalSuccess),
      icon: CheckCircle2,
      accent: '#22c55e',
      accentBg: 'rgba(34,197,94,0.08)',
    },
    {
      label: 'Failed Installs',
      value: formatNumber(stats.totalFailed),
      icon: XCircle,
      accent: '#f43f5e',
      accentBg: 'rgba(244,63,94,0.08)',
    },
    {
      label: 'Total Spent',
      value: `Rp ${formatNumber(stats.totalSpent)}`,
      icon: TrendingDown,
      accent: '#f59e0b',
      accentBg: 'rgba(245,158,11,0.08)',
    },
    {
      label: 'Idle Balance',
      value: `Rp ${formatNumber(stats.totalBalance)}`,
      icon: Wallet,
      accent: '#a78bfa',
      accentBg: 'rgba(167,139,250,0.08)',
      subtitle: 'Unused credit across all users',
    },
    {
      label: 'Cloud Accounts',
      value: formatNumber(stats.totalCloudAccounts || 0),
      icon: Cloud,
      accent: '#3b82f6',
      accentBg: 'rgba(59,130,246,0.08)',
    },

  ] : []

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">Overview</h1>
          <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Global admin dashboard</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by Install ID..."
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm text-white placeholder:text-gray-600 outline-none transition-all focus:ring-1"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
            }}
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchResults !== null && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <h2 className="text-sm font-medium text-white">
              Search Results
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {searchResults.length} found
              </span>
            </h2>
          </div>
          <div className="px-3 lg:px-4">
            {searchResults.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No installations found for &ldquo;{searchId}&rdquo;
              </div>
            ) : (
              searchResults.map(item => (
                <ActivityItem key={item.id} item={item} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 lg:gap-3">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="rounded-lg p-3 lg:p-4 animate-pulse" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', height: '80px' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 lg:gap-3">
          {statCards.map((stat) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="rounded-lg p-3 lg:p-4 transition-all duration-200 hover:translate-y-[-1px]"
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] lg:text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                    {stat.label}
                  </span>
                  <div className="rounded-md p-1" style={{ background: stat.accentBg }}>
                    <Icon className="size-3" style={{ color: stat.accent }} />
                  </div>
                </div>
                <div className="text-lg lg:text-xl font-bold text-white mt-1.5 tabular-nums">
                  {stat.value}
                </div>
                {'subtitle' in stat && stat.subtitle && (
                  <div className="text-[10px] lg:text-xs mt-0.5 hidden sm:block" style={{ color: 'var(--text-muted)' }}>{stat.subtitle}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Charts */}
      {stats && stats.monthly.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
          <div className="lg:col-span-2">
            <MonthlyChart data={stats.monthly} />
          </div>
          <HorizontalBarChart data={[
            { label: 'Total Spent', value: stats.totalSpent, color: '#00f5d4', formatted: `Rp ${(stats.totalSpent / 1000).toFixed(0)}K` },
            { label: 'Success Installs', value: stats.totalSuccess, color: '#22c55e', formatted: stats.totalSuccess.toString() },
            { label: 'Failed Installs', value: stats.totalFailed, color: '#f43f5e', formatted: stats.totalFailed.toString() },
            { label: 'Total Users', value: stats.totalUsers, color: '#3b82f6', formatted: stats.totalUsers.toString() },
            { label: 'Idle Balance', value: stats.totalBalance, color: '#a78bfa', formatted: `Rp ${(stats.totalBalance / 1000).toFixed(0)}K` },
          ]} />
        </div>
      )}

      {/* Activity Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        {/* Owner Activity */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <h2 className="text-sm font-medium text-white tracking-wide uppercase" style={{ letterSpacing: '0.08em', fontSize: '11px' }}>Owner Activity</h2>
            <p className="text-[10px] lg:text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Your recent actions</p>
          </div>
          <div className="px-3 lg:px-4">
            {ownerActivity.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No recent activity</div>
            ) : (
              ownerActivity.map(item => (
                <ActivityItem key={`owner-${item.type}-${item.id}`} item={item} isOwner />
              ))
            )}
          </div>
        </div>

        {/* Global Activity */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <h2 className="text-sm font-medium text-white tracking-wide uppercase" style={{ letterSpacing: '0.08em', fontSize: '11px' }}>Global Activity</h2>
              <p className="text-[10px] lg:text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>All users&apos; recent actions</p>
            </div>
            <a href="/admin/activity" className="text-xs font-medium transition-opacity hover:opacity-80" style={{ color: 'var(--q-accent)' }}>
              View All →
            </a>
          </div>
          <div className="px-3 lg:px-4 pt-3">
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {['all', 'topup', 'install', 'refund', 'cloud'].map(f => (
                <button key={f} onClick={() => setActivityFilter(f)}
                  className="px-2.5 py-1 rounded-md text-[11px] lg:text-xs font-medium transition-all"
                  style={{
                    background: activityFilter === f ? 'var(--q-accent)' : 'var(--surface-2)',
                    color: activityFilter === f ? '#000' : 'var(--text-muted)',
                  }}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            {(() => {
              const filteredActivity = activityFilter === 'all'
                ? globalActivity
                : globalActivity.filter(item => item.type === activityFilter)
              return loading ? (
                <div className="py-8 text-center">
                  <Loader2 className="size-5 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : filteredActivity.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No recent activity</div>
              ) : (
                filteredActivity.slice(0, 10).map(item => (
                  <ActivityItem key={`global-${item.type}-${item.id}`} item={item} />
                ))
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
