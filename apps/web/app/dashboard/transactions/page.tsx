'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Loader2, ArrowUpRight, ArrowDownRight, RefreshCw, Inbox, ChevronLeft, ChevronRight } from 'lucide-react'

type TransactionStatus = 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled'
type TransactionType = 'topup' | 'deduction'
type FilterValue = TransactionStatus | 'all'

interface Transaction {
  id: string
  amount: number
  type: TransactionType
  status: TransactionStatus
  created_at: string
  description?: string
  payment_id?: string
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

function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Math.abs(value))
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
        status === 'completed' && 'bg-emerald-500/10 text-emerald-400',
        status === 'pending' && 'bg-amber-500/10 text-amber-400',
        status === 'failed' && 'bg-red-500/10 text-red-400',
        status === 'expired' && 'bg-amber-500/10 text-amber-400',
        status === 'cancelled' && 'bg-gray-500/10 text-gray-400'
      )}
    >
      {status === 'pending' && <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function TransactionsPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 20
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTransactions = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ status: filter, page: String(page), limit: String(perPage) })
      const res = await fetch(`/api/transactions?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch')
      setTransactions(json.data || [])
      if (json.pagination) {
        setTotal(json.pagination.total)
        setTotalPages(Math.max(1, Math.ceil(json.pagination.total / perPage)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions')
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  // Initial fetch + refetch on filter change
  useEffect(() => {
    fetchTransactions(true)
  }, [fetchTransactions])

  // Auto-refresh every 10s to keep status updated
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchTransactions(false), 10_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchTransactions])

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-gray-500 text-sm mt-1">Your topup and payment history</p>
        </div>
        <button
          onClick={() => fetchTransactions(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-2 rounded-lg hover:bg-gray-800/60"
          title="Refresh"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setPage(1) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && transactions.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-gray-600" />
        </div>
      ) : error ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => fetchTransactions(true)}
            className="mt-3 text-xs text-red-400/70 hover:text-red-300 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl py-16 text-center">
          <Inbox className="size-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No transactions found</p>
          <p className="text-xs text-gray-600 mt-1">
            {filter !== 'all' ? 'Try a different filter' : 'Top up your account to get started'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800/60">
                <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-400">{formatWIB(tx.created_at)}</td>
                  <td className="px-4 py-3">
                    {tx.payment_id?.startsWith('refund_') ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400">
                        ↩ Refund
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full',
                          tx.type === 'topup'
                            ? 'bg-blue-600/10 text-blue-400'
                            : 'bg-orange-600/10 text-orange-400'
                        )}
                      >
                        {tx.type === 'topup' ? (
                          <ArrowUpRight className="size-3" />
                        ) : (
                          <ArrowDownRight className="size-3" />
                        )}
                        {tx.type === 'topup' ? 'Top Up' : 'Order'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium tabular-nums">
                    {tx.status === 'pending' && tx.type === 'topup' ? (
                      <span className="text-blue-400">+{formatRupiah(tx.amount)}</span>
                    ) : (['failed', 'expired', 'cancelled'] as TransactionStatus[]).includes(tx.status) ? (
                      <span className="text-gray-500 line-through">
                        {tx.type === 'topup' || tx.payment_id?.startsWith('refund_') ? '+' : '-'}
                        {formatRupiah(tx.amount)}
                      </span>
                    ) : tx.payment_id?.startsWith('refund_') ? (
                      <span className="text-amber-400">+{formatRupiah(tx.amount)}</span>
                    ) : tx.type === 'topup' ? (
                      <span className="text-emerald-400">+{formatRupiah(tx.amount)}</span>
                    ) : (
                      <span className="text-red-400">-{formatRupiah(tx.amount)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <StatusBadge status={tx.status} />
                      {tx.status === 'pending' && tx.type === 'topup' && (
                        <button
                          onClick={() => router.push(`/pay/${tx.id}`)}
                          className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                        >
                          Pay Now
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800/60">
              <span className="text-xs text-gray-500">
                {total} transactions
              </span>
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
        </div>
      )}
    </div>
  )
}
