'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

/* ─── Types ─── */
interface Transaction {
  id: string
  user_id: string
  amount: number
  type: string
  status: string
  payment_method?: string
  payment_id?: string
  created_at: string
  updated_at?: string
  users?: { email: string }
}

/* ─── Helpers ─── */
function formatWIB(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.abs(amount))
}

/* ─── Status Badge ─── */
const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400',
  pending: 'bg-amber-500/10 text-amber-400',
  failed: 'bg-red-500/10 text-red-400',
  expired: 'bg-orange-500/10 text-orange-400',
  cancelled: 'bg-zinc-500/10 text-zinc-400',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[status] || 'bg-white/5 text-white/50'}`}>
      {status}
    </span>
  )
}

/* ─── Type Badge ─── */
function TypeBadge({ tx }: { tx: Transaction }) {
  const isRefund = tx.payment_id?.startsWith('refund_')
  if (isRefund) {
    return (
      <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-orange-500/10 text-orange-400">
        ↩ Refund
      </span>
    )
  }
  if (tx.type === 'topup') {
    return (
      <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-blue-500/10 text-blue-400">
        ↑ Top Up
      </span>
    )
  }
  return (
    <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-purple-500/10 text-purple-400">
      ↓ Order
    </span>
  )
}

/* ─── Main Page ─── */
export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTransactions = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter && { status: statusFilter }),
      })

      const response = await fetch(`/api/admin/transactions?${params}`)
      if (!response.ok) throw new Error('Failed to fetch transactions')

      const json = await response.json()
      setTransactions(json.data || [])
      setTotalPages(json.pagination?.totalPages || 1)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    fetchTransactions(true)
  }, [fetchTransactions])

  // Poll every 3s when pending transactions exist
  useEffect(() => {
    const hasPending = transactions.some(tx => tx.status === 'pending')
    if (hasPending) {
      intervalRef.current = setInterval(() => fetchTransactions(false), 3000)
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [transactions, fetchTransactions])

  // Client-side filtering for refund type
  const filteredTransactions = transactions.filter(tx => {
    if (typeFilter === 'refund') {
      return tx.payment_id?.startsWith('refund_')
    }
    if (typeFilter === 'topup') {
      return tx.type === 'topup' && !tx.payment_id?.startsWith('refund_')
    }
    if (typeFilter === 'deduction') {
      return tx.type === 'deduction'
    }
    return true // 'all'
  })

  const getAmountDisplay = (tx: Transaction) => {
    const isCancelled = ['failed', 'expired', 'cancelled'].includes(tx.status)
    const isRefund = tx.payment_id?.startsWith('refund_')

    if (isCancelled) {
      // Gray + strikethrough for any cancelled/expired/failed
      return (
        <span style={{ color: 'var(--text-muted, #55566a)', textDecoration: 'line-through' }}>
          {tx.type === 'topup' || isRefund ? '+' : '-'}Rp {formatCurrency(tx.amount)}
        </span>
      )
    }

    if (isRefund) {
      return <span style={{ color: 'var(--amber, #f59e0b)' }}>+Rp {formatCurrency(tx.amount)}</span>
    }

    if (tx.type === 'topup') {
      return <span style={{ color: 'var(--green, #22c55e)' }}>+Rp {formatCurrency(tx.amount)}</span>
    }

    return <span style={{ color: 'var(--text-secondary, #8a8b9e)' }}>-Rp {formatCurrency(tx.amount)}</span>
  }

  return (
    <div className="space-y-3 lg:space-y-4 max-w-7xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-white">Transactions</h1>
          <p className="text-xs lg:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>All transaction history</p>
        </div>
        <button
          onClick={() => fetchTransactions(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-800/60"
          title="Refresh"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl p-3 lg:p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="w-full h-9 px-3 rounded-lg text-sm text-white outline-none transition-all focus:ring-1"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Type</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="w-full h-9 px-3 rounded-lg text-sm text-white outline-none transition-all focus:ring-1"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
            >
              <option value="">All Types</option>
              <option value="topup">Top Up</option>
              <option value="deduction">Deduction</option>
              <option value="refund">Refund</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
        {loading && transactions.length === 0 ? (
          <div className="py-10 lg:py-16 text-center">
            <Loader2 className="size-5 mx-auto animate-spin" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>Loading transactions...</p>
          </div>
        ) : error ? (
          <div className="py-10 lg:py-16 text-center text-sm text-red-400">{error}</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-10 lg:py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No transactions found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>User</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider hidden sm:table-cell" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Date</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Type</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Amount</th>
                    <th className="px-3 lg:px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-3 lg:px-5 py-3 text-sm truncate max-w-[150px] lg:max-w-none" style={{ color: 'var(--text-secondary)' }}>
                        {tx.users?.email || 'Unknown'}
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-sm hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                        {formatWIB(tx.created_at)}
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-sm">
                        <TypeBadge tx={tx} />
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-sm font-medium tabular-nums">
                        {getAmountDisplay(tx)}
                      </td>
                      <td className="px-3 lg:px-5 py-3 text-sm">
                        <StatusBadge status={tx.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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
          </>
        )}
      </div>
    </div>
  )
}
