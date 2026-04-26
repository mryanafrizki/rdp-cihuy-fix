'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Cloud, Shield, ArrowUpRight, ArrowDownLeft, RotateCcw, RefreshCw } from 'lucide-react'

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

/* ─── Auth action label ─── */
function getAuthActionLabel(action: string): string {
  switch (action) {
    case 'login': return 'Login'
    case 'register': return 'Register'
    case 'logout': return 'Logout'
    case 'change_password': return 'Changed Password'
    case 'forgot_password': return 'Forgot Password'
    case 'reset_password': return 'Reset Password'
    case 'admin_topup': return 'Admin Top-up'
    case 'admin_edit_balance': return 'Admin Edit Balance'
    case 'admin_delete_user': return 'Admin Delete User'
    case 'admin_settings_change': return 'Admin Settings Change'
    case 'profile_update': return 'Profile Update'
    default: return action
  }
}

/* ─── ActivityItem ─── */
function ActivityItem({ item }: {
  item: {
    id: string
    type: 'topup' | 'order' | 'refund' | 'install' | 'cloud' | 'auth'
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
    ip?: string
    device?: string
    userAgent?: string
  }
}) {
  const [expanded, setExpanded] = useState(false)
  const isFailed = item.type === 'install' && item.status === 'failed'
  const hasLogs = isFailed && (item.log || item.error_log)
  const txStatusColor = getTxStatusColor(item.status)
  const isTxNonCompleted = (item.type === 'topup' || item.type === 'order' || item.type === 'refund') && item.status !== 'completed'

  return (
    <div className="transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        className="flex items-center justify-between py-3 px-1"
        style={{ cursor: hasLogs ? 'pointer' : 'default' }}
        onClick={() => hasLogs && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {item.type === 'topup' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: isTxNonCompleted ? txStatusColor.bg : 'rgba(0,245,212,0.08)' }}>
              {item.status === 'pending' ? <Loader2 className="size-4 animate-spin" style={{ color: txStatusColor.text }} /> :
                <ArrowUpRight className="size-4" style={{ color: isTxNonCompleted ? txStatusColor.text : 'var(--q-accent)' }} />}
            </div>
          )}
          {item.type === 'order' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(244,63,94,0.08)' }}>
              <ArrowDownLeft className="size-4" style={{ color: '#f43f5e' }} />
            </div>
          )}
          {item.type === 'refund' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: isTxNonCompleted ? txStatusColor.bg : 'rgba(245,158,11,0.08)' }}>
              <RotateCcw className="size-4" style={{ color: isTxNonCompleted ? txStatusColor.text : 'var(--amber)' }} />
            </div>
          )}
          {item.type === 'install' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{
              background: item.status === 'completed' ? 'rgba(34,197,94,0.08)' :
                item.status === 'failed' ? 'rgba(244,63,94,0.08)' : 'rgba(59,130,246,0.08)'
            }}>
              {item.status === 'completed' ? <CheckCircle2 className="size-4 text-emerald-400" /> :
                item.status === 'failed' ? <XCircle className="size-4 text-red-400" /> :
                  <Loader2 className="size-4 text-blue-400 animate-spin" />}
            </div>
          )}
          {item.type === 'cloud' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.1)' }}>
              <Cloud className="size-4 text-blue-400" />
            </div>
          )}
          {item.type === 'auth' && (
            <div className="size-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(168,85,247,0.1)' }}>
              <Shield className="size-4 text-purple-400" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm text-white flex items-center gap-2">
              <span>
                {item.type === 'topup' ? 'Top Up' :
                  item.type === 'order' ? 'Order RDP' :
                  item.type === 'refund' ? 'Refund' :
                  item.type === 'auth' ? getAuthActionLabel(item.action || '') :
                  item.type === 'cloud' ? (
                    item.action === 'cloud_add_account' ? 'Added DO Account' :
                    item.action === 'cloud_delete_account' ? 'Deleted DO Account' :
                    item.action === 'cloud_add_proxy' ? 'Added Proxy' :
                    item.action === 'cloud_delete_proxy' ? 'Deleted Proxy' :
                    item.action === 'cloud_create_vps' ? 'Created VPS' :
                    item.action === 'cloud_create_vps_rdp' ? 'Created VPS + RDP' :
                    item.action === 'cloud_delete_vps' ? 'Deleted VPS' :
                    item.action === 'cloud_droplet_reboot' ? 'Rebooted VPS' :
                    item.action === 'cloud_droplet_power_off' ? 'Powered Off VPS' :
                    item.action === 'cloud_droplet_power_on' ? 'Powered On VPS' :
                    item.action === 'cloud_droplet_password_reset' ? 'Reset VPS Password' :
                    item.action === 'cloud_droplet_set_password' ? 'Set VPS Password' :
                    item.action === 'cloud_droplet_rename' ? 'Renamed VPS' :
                    item.action === 'cloud_droplet_rebuild' ? 'Rebuilt VPS' :
                    item.action || 'Cloud Action'
                  ) : 'Install RDP'}
              </span>
              {item.install_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                  {item.install_id}
                </span>
              )}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {item.type === 'install' ? `${item.vps_ip || '—'} · ${item.windows_version || '—'}` :
               item.type === 'auth' ? `${formatWIB(item.updated_at)} · ${item.ip || '—'} · ${item.device || 'Unknown Device'}` :
               item.type === 'cloud' ? `${formatWIB(item.updated_at)}${item.details?.name ? ` · ${item.details.name}` : ''}` :
               formatWIB(item.updated_at)}
              <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>by: {item.email}</span>
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
          {item.type === 'auth' && (
            <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-purple-500/10 text-purple-400">
              Auth
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

/* ─── types ─── */
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

const ITEMS_PER_PAGE = 20

/* ─── Main Page ─── */
export default function AdminActivityPage() {
  const [allItems, setAllItems] = useState<any[]>([])
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searchId, setSearchId] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/activity')
      if (res.ok) {
        const json = await res.json()
        const txs = (json.transactions || []) as ActivityTransaction[]
        const insts = (json.installations || []) as ActivityInstallation[]
        const allLogs = (json.auth_activity || []) as any[]
        const cloudFromLogs = allLogs.filter((a: any) => a.action?.startsWith('cloud_'))
        const authFromLogs = allLogs.filter((a: any) => !a.action?.startsWith('cloud_'))

        const items = [
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
            ip: a.ip,
            device: a.device,
            userAgent: a.userAgent,
          })),
          ...authFromLogs.map((a: any, i: number) => ({
            id: `auth-${i}-${a.timestamp}`,
            type: 'auth' as const,
            action: a.action,
            details: a.details,
            status: 'completed',
            email: a.email || '—',
            updated_at: a.timestamp,
            ip: a.ip,
            device: a.device,
            userAgent: a.userAgent,
          })),
        ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

        setAllItems(items)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

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

  // Filter by type
  const filteredItems = typeFilter
    ? allItems.filter(item => item.type === typeFilter)
    : allItems

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE))
  const paginatedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  return (
    <div className="space-y-3 lg:space-y-4 max-w-5xl">
      {/* Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">Activity</h1>
            <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>All user activity across the platform</p>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2 rounded-lg transition-colors hover:bg-gray-800/60 disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by Install ID..."
            value={searchId}
            onChange={e => { setSearchId(e.target.value); setPage(1) }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all focus:ring-1"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
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
          <div className="px-4">
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

      {/* Filters */}
      {searchResults === null && (
        <div className="flex gap-2 flex-wrap">
          {['', 'topup', 'order', 'install', 'refund', 'cloud', 'auth'].map((filter) => (
            <button
              key={filter}
              onClick={() => { setTypeFilter(filter); setPage(1) }}
              className="px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-medium transition-all capitalize"
              style={{
                background: typeFilter === filter ? 'rgba(0,245,212,0.1)' : 'var(--surface-2)',
                border: `1px solid ${typeFilter === filter ? 'rgba(0,245,212,0.3)' : 'var(--border-subtle)'}`,
                color: typeFilter === filter ? 'var(--q-accent)' : 'var(--text-muted)',
              }}
            >
              {filter || 'All'}
            </button>
          ))}
        </div>
      )}

      {/* Activity List */}
      {searchResults === null && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <h2 className="text-sm font-medium text-white">
              All Activity
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {filteredItems.length} items
              </span>
            </h2>
          </div>
          <div className="px-4">
            {loading ? (
              <div className="py-8 lg:py-12 text-center">
                <Loader2 className="size-5 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : paginatedItems.length === 0 ? (
              <div className="py-8 lg:py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No activity found</div>
            ) : (
              paginatedItems.map(item => (
                <ActivityItem key={`${item.type}-${item.id}`} item={item} />
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  <ChevronLeft className="size-3" /> Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  Next <ChevronRight className="size-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
