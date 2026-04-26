'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Loader2, ChevronLeft, ChevronRight, Eye, Copy, Check, Key, ArrowUpCircle, ArrowDownCircle, Monitor, Filter } from 'lucide-react'

interface EnrichedUser {
  id: string
  email: string
  credit_balance: number
  role: string
  is_admin: boolean
  created_at: string
  total_spent: number
  total_success: number
  last_login: string | null
  cloud_accounts: number
  cloud_droplets: number
}

interface UserActivity {
  id: string
  type: 'topup' | 'refund' | 'install'
  status: string
  amount?: number
  vps_ip?: string
  windows_version?: string
  rdp_password?: string
  install_id?: string
  payment_id?: string
  updated_at: string
}

type ActivityFilter = 'all' | 'topup' | 'install' | 'refund'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

function formatWIB(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'super_admin'
  const [users, setUsers] = useState<EnrichedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<EnrichedUser | null>(null)
  const [topupAmount, setTopupAmount] = useState('')
  const [topupLoading, setTopupLoading] = useState(false)
  const [detailUser, setDetailUser] = useState<EnrichedUser | null>(null)
  const [detailActivity, setDetailActivity] = useState<UserActivity[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailPage, setDetailPage] = useState(1)
  const [detailTotalPages, setDetailTotalPages] = useState(1)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchUserActivity = useCallback(async (userId: string, pg = 1, filter: ActivityFilter = 'all') => {
    setDetailLoading(true)
    try {
      const limit = 10

      if (filter === 'topup' || filter === 'refund') {
        // Both topup and refund are stored as type=topup in DB
        // Refunds have payment_id starting with 'refund_'
        const txRes = await fetch(`/api/admin/transactions?user_id=${userId}&page=1&limit=100&status=all&type=topup`)
        if (txRes.ok) {
          const txJson = await txRes.json()
          const allItems: UserActivity[] = (txJson.data || []).map((tx: Record<string, unknown>) => ({
            id: tx.id as string,
            type: (tx.payment_id as string)?.startsWith('refund_') ? 'refund' as const : 'topup' as const,
            status: tx.status as string,
            amount: tx.amount as number,
            payment_id: tx.payment_id as string | undefined,
            updated_at: (tx.updated_at || tx.created_at) as string,
          }))
          // Client-side filter based on payment_id
          const filtered = filter === 'refund'
            ? allItems.filter(item => item.payment_id?.startsWith('refund_'))
            : allItems.filter(item => !item.payment_id?.startsWith('refund_'))
          // Apply pagination client-side
          const start = (pg - 1) * limit
          const paged = filtered.slice(start, start + limit)
          setDetailActivity(paged)
          setDetailTotalPages(Math.max(1, Math.ceil(filtered.length / limit)))
        }
      } else if (filter === 'install') {
        // Only fetch installations
        const instRes = await fetch(`/api/admin/installations?user_id=${userId}&page=${pg}&limit=${limit}`)
        if (instRes.ok) {
          const instJson = await instRes.json()
          const instItems: UserActivity[] = (instJson.data || []).map((inst: Record<string, unknown>) => ({
            id: inst.id as string,
            type: 'install' as const,
            status: inst.status as string,
            vps_ip: inst.vps_ip as string | undefined,
            windows_version: inst.windows_version as string | undefined,
            rdp_password: inst.rdp_password as string | undefined,
            install_id: inst.install_id as string | undefined,
            updated_at: (inst.updated_at || inst.created_at) as string,
          }))
          setDetailActivity(instItems)
          setDetailTotalPages(instJson.pagination?.totalPages || 1)
        }
      } else {
        // Fetch both, merge and sort
        const [txRes, instRes] = await Promise.all([
          fetch(`/api/admin/transactions?user_id=${userId}&page=${pg}&limit=${limit}&status=all`),
          fetch(`/api/admin/installations?user_id=${userId}&page=${pg}&limit=${limit}`),
        ])

        let txItems: UserActivity[] = []
        let instItems: UserActivity[] = []
        let txTotal = 0
        let instTotal = 0

        if (txRes.ok) {
          const txJson = await txRes.json()
          txTotal = txJson.pagination?.total || 0
          txItems = (txJson.data || []).map((tx: Record<string, unknown>) => ({
            id: tx.id as string,
            type: tx.type as 'topup' | 'refund',
            status: tx.status as string,
            amount: tx.amount as number,
            payment_id: tx.payment_id as string | undefined,
            updated_at: (tx.updated_at || tx.created_at) as string,
          }))
        }

        if (instRes.ok) {
          const instJson = await instRes.json()
          instTotal = instJson.pagination?.total || 0
          instItems = (instJson.data || []).map((inst: Record<string, unknown>) => ({
            id: inst.id as string,
            type: 'install' as const,
            status: inst.status as string,
            vps_ip: inst.vps_ip as string | undefined,
            windows_version: inst.windows_version as string | undefined,
            rdp_password: inst.rdp_password as string | undefined,
            install_id: inst.install_id as string | undefined,
            updated_at: (inst.updated_at || inst.created_at) as string,
          }))
        }

        const merged = [...txItems, ...instItems].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        setDetailActivity(merged)
        // Approximate total pages from combined totals
        const combinedTotal = txTotal + instTotal
        setDetailTotalPages(Math.max(1, Math.ceil(combinedTotal / limit)))
      }
    } catch {
      setDetailActivity([])
      setDetailTotalPages(1)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(searchQuery && { search: searchQuery }),
      })

      const response = await fetch(`/api/admin/users?${params}`)
      if (!response.ok) throw new Error('Failed to fetch users')

      const data = await response.json()
      setUsers(data.users || data.data || [])
      setTotalPages(data.totalPages || data.pagination?.totalPages || 1)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleTopup = async () => {
    if (!selectedUser || !topupAmount) return

    try {
      setTopupLoading(true)
      const response = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'topup',
          email: selectedUser.email,
          amount: parseFloat(topupAmount),
        }),
      })

      if (!response.ok) throw new Error('Failed to top up user')

      setShowTopupModal(false)
      setSelectedUser(null)
      setTopupAmount('')
      fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to top up user')
    } finally {
      setTopupLoading(false)
    }
  }

  const openDetailModal = (user: EnrichedUser) => {
    setDetailUser(user)
    setDetailPage(1)
    setActivityFilter('all')
    fetchUserActivity(user.id, 1, 'all')
  }

  const handleFilterChange = (filter: ActivityFilter) => {
    setActivityFilter(filter)
    setDetailPage(1)
    if (detailUser) fetchUserActivity(detailUser.id, 1, filter)
  }

  const handleDetailPageChange = (newPage: number) => {
    setDetailPage(newPage)
    if (detailUser) fetchUserActivity(detailUser.id, newPage, activityFilter)
  }

  const closeDetailModal = () => {
    setDetailUser(null)
    setDetailActivity([])
    setDetailPage(1)
    setDetailTotalPages(1)
    setActivityFilter('all')
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'topup': return <ArrowUpCircle className="size-3.5" />
      case 'refund': return <ArrowDownCircle className="size-3.5" />
      case 'install': return <Monitor className="size-3.5" />
      default: return <Key className="size-3.5" />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'topup': return { bg: 'rgba(34,197,94,0.08)', color: '#22c55e', border: 'rgba(34,197,94,0.15)' }
      case 'refund': return { bg: 'rgba(245,158,11,0.08)', color: '#f59e0b', border: 'rgba(245,158,11,0.15)' }
      case 'install': return { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: 'rgba(59,130,246,0.15)' }
      default: return { bg: 'var(--surface-2)', color: 'var(--text-muted)', border: 'var(--border-subtle)' }
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-emerald-500/10 text-emerald-400',
      success: 'bg-emerald-500/10 text-emerald-400',
      failed: 'bg-red-500/10 text-red-400',
      pending: 'bg-amber-500/10 text-amber-400',
      processing: 'bg-blue-500/10 text-blue-400',
      installing: 'bg-blue-500/10 text-blue-400',
    }
    return styles[status] || 'bg-gray-500/10 text-gray-400'
  }

  const filterButtons: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'topup', label: 'Topup' },
    { key: 'install', label: 'Install' },
    { key: 'refund', label: 'Refund' },
  ]

  return (
    <div className="space-y-3 lg:space-y-4 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">User Management</h1>
        <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {users.length > 0 ? `${users.length} users loaded` : 'Search and manage users'}
        </p>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search by email..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setPage(1)
          }}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all focus:ring-1"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-subtle)',
          }}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        {loading ? (
          <div className="py-10 lg:py-16 text-center">
            <Loader2 className="size-6 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>Loading users...</p>
          </div>
        ) : error ? (
          <div className="py-10 lg:py-16 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-10 lg:py-16 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No users found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Email</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Balance</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Total Spent</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Success Installs</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hidden xl:table-cell" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Cloud Acc</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hidden xl:table-cell" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>VPS</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Created</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Last Login</th>
                    <th className="px-3 lg:px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="px-3 lg:px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="size-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              background: user.role === 'admin' || user.role === 'super_admin' ? 'rgba(192,38,211,0.1)' : 'rgba(0,245,212,0.06)',
                              color: user.role === 'admin' || user.role === 'super_admin' ? '#c026d3' : 'var(--q-accent)',
                            }}
                          >
                            {(user.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-white truncate">{user.email}</div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                              background: user.role === 'admin' ? 'rgba(192,38,211,0.1)' : user.role === 'super_admin' ? 'rgba(239,68,68,0.1)' : 'rgba(0,245,212,0.06)',
                              color: user.role === 'admin' ? '#c026d3' : user.role === 'super_admin' ? '#ef4444' : 'var(--q-accent)',
                            }}>
                              {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'User'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 lg:px-5 py-3">
                        <span className="text-sm tabular-nums text-white">{formatCurrency(user.credit_balance)}</span>
                      </td>
                      <td className="px-3 lg:px-5 py-3 hidden lg:table-cell">
                        <span className="text-sm tabular-nums" style={{ color: user.total_spent > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
                          {formatCurrency(user.total_spent)}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3 hidden lg:table-cell">
                        <span className="text-sm tabular-nums" style={{ color: user.total_success > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                          {user.total_success}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3 hidden xl:table-cell">
                        <span className="text-sm tabular-nums" style={{ color: (user.cloud_accounts || 0) > 0 ? '#3b82f6' : 'var(--text-muted)' }}>
                          {user.cloud_accounts || 0}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3 hidden xl:table-cell">
                        <span className="text-sm tabular-nums" style={{ color: (user.cloud_droplets || 0) > 0 ? '#06b6d4' : 'var(--text-muted)' }}>
                          {user.cloud_droplets || 0}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3 hidden md:table-cell">
                        <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {user.created_at ? formatWIB(user.created_at) : '—'}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3 hidden md:table-cell">
                        <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: user.last_login ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                          {user.last_login ? formatWIB(user.last_login) : 'Never'}
                        </span>
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDetailModal(user)}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all hover:translate-y-[-1px]"
                            style={{
                              background: 'rgba(59,130,246,0.08)',
                              color: '#3b82f6',
                              border: '1px solid rgba(59,130,246,0.15)',
                            }}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => {
                                setSelectedUser(user)
                                setShowTopupModal(true)
                              }}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:translate-y-[-1px]"
                              style={{
                                background: 'rgba(0,245,212,0.08)',
                                color: 'var(--q-accent)',
                                border: '1px solid rgba(0,245,212,0.15)',
                              }}
                            >
                              Top Up
                            </button>
                          )}
                          {isSuperAdmin && (
                            <select
                              value={user.role}
                              onChange={async (e) => {
                                const newRole = e.target.value
                                if (newRole === user.role) return
                                if (!confirm(`Change ${user.email} role to ${newRole}?`)) {
                                  e.target.value = user.role
                                  return
                                }
                                try {
                                  const res = await fetch('/api/admin/users', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: user.id, role: newRole })
                                  })
                                  const data = await res.json()
                                  if (data.success) {
                                    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
                                  } else {
                                    e.target.value = user.role
                                    alert(data.error || 'Failed to change role')
                                  }
                                } catch {
                                  e.target.value = user.role
                                }
                              }}
                              className="text-xs px-2 py-1.5 rounded-lg cursor-pointer"
                              style={{
                                background: 'var(--surface-2)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                              <option value="super_admin">Super Admin</option>
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                >
                  <ChevronLeft className="size-3" />
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                >
                  Next
                  <ChevronRight className="size-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* User Detail Modal (Activity) */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-2xl rounded-xl max-h-[80vh] flex flex-col"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}
          >
            {/* Modal Header - fixed */}
            <div className="p-6 pb-0 space-y-4 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{detailUser.email}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Balance: {formatCurrency(detailUser.credit_balance)} · Installs: {detailUser.total_success}
                  </p>
                </div>
                <button
                  onClick={closeDetailModal}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
                >
                  Close
                </button>
              </div>

              {/* Section header + filter */}
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-medium uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                  <Filter className="size-3" /> User Activity
                </h4>
                <div className="flex gap-1">
                  {filterButtons.map((fb) => (
                    <button
                      key={fb.key}
                      onClick={() => handleFilterChange(fb.key)}
                      className="text-[10px] font-medium px-2.5 py-1 rounded-md transition-all"
                      style={{
                        background: activityFilter === fb.key ? 'rgba(0,245,212,0.1)' : 'var(--surface-2)',
                        color: activityFilter === fb.key ? 'var(--q-accent)' : 'var(--text-muted)',
                        border: `1px solid ${activityFilter === fb.key ? 'rgba(0,245,212,0.2)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {fb.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Body - scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {detailLoading ? (
                <div className="py-8 text-center">
                  <Loader2 className="size-4 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : detailActivity.length === 0 ? (
                <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>No activity found</div>
              ) : (
                <div className="space-y-2">
                  {detailActivity.map((item) => {
                    const colors = getActivityColor(item.type)
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="rounded-lg p-3 flex items-center justify-between gap-3"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Type icon */}
                          <div
                            className="size-7 rounded-md flex items-center justify-center shrink-0"
                            style={{ background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}
                          >
                            {getActivityIcon(item.type)}
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* Top row */}
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-medium uppercase text-[10px]" style={{ color: colors.color }}>
                                {item.type}
                              </span>

                              {(item.type === 'topup' || item.type === 'refund') && item.amount != null && (
                                <span className="font-mono text-xs" style={{ color: colors.color }}>
                                  {formatCurrency(item.amount)}
                                </span>
                              )}

                              {item.type === 'install' && item.vps_ip && (
                                <span className="font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                                  {item.vps_ip}
                                </span>
                              )}

                              {item.type === 'install' && item.windows_version && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                                  {item.windows_version}
                                </span>
                              )}

                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusBadge(item.status)}`}>
                                {item.status}
                              </span>
                            </div>

                            {/* Bottom row */}
                            <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                              {item.type === 'install' && item.install_id && <>{item.install_id} · </>}
                              {(item.type === 'topup' || item.type === 'refund') && item.payment_id && <>{item.payment_id} · </>}
                              {formatWIB(item.updated_at)}
                            </div>
                          </div>
                        </div>

                        {/* Right side: copy RDP password for installs */}
                        <div className="shrink-0">
                          {item.type === 'install' && item.rdp_password ? (
                            <button
                              onClick={() => copyToClipboard(item.rdp_password!, item.id)}
                              className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-lg transition-all"
                              style={{
                                background: copiedId === item.id ? 'rgba(34,197,94,0.1)' : 'rgba(0,245,212,0.06)',
                                color: copiedId === item.id ? '#22c55e' : 'var(--q-accent)',
                                border: `1px solid ${copiedId === item.id ? 'rgba(34,197,94,0.2)' : 'rgba(0,245,212,0.1)'}`,
                              }}
                            >
                              {copiedId === item.id ? <Check className="size-3" /> : <Copy className="size-3" />}
                              {item.rdp_password}
                            </button>
                          ) : item.type === 'install' ? (
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No password</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer - pagination, fixed */}
            {detailTotalPages > 1 && (
              <div className="px-6 py-3 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  Page {detailPage} of {detailTotalPages}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleDetailPageChange(detailPage - 1)}
                    disabled={detailPage <= 1}
                    className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md transition-colors disabled:opacity-30"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <ChevronLeft className="size-2.5" />
                    Prev
                  </button>
                  <button
                    onClick={() => handleDetailPageChange(detailPage + 1)}
                    disabled={detailPage >= detailTotalPages}
                    className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md transition-colors disabled:opacity-30"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                  >
                    Next
                    <ChevronRight className="size-2.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Up Modal */}
      {showTopupModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-md rounded-xl p-6 space-y-5"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}
          >
            <div>
              <h3 className="text-lg font-semibold text-white">Top Up User</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add credits to user account</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                  User Email
                </label>
                <div className="px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                  {selectedUser.email}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                  Amount (IDR)
                </label>
                <input
                  type="number"
                  placeholder="Enter amount..."
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all focus:ring-1"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setShowTopupModal(false)
                  setSelectedUser(null)
                  setTopupAmount('')
                }}
                className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleTopup}
                disabled={topupLoading || !topupAmount}
                className="text-xs font-medium px-4 py-2 rounded-lg transition-all disabled:opacity-40 hover:translate-y-[-1px]"
                style={{
                  background: 'rgba(0,245,212,0.12)',
                  color: 'var(--q-accent)',
                  border: '1px solid rgba(0,245,212,0.2)',
                }}
              >
                {topupLoading ? 'Processing...' : 'Top Up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
