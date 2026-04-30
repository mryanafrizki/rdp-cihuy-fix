import { auth } from '@/lib/auth-config'
import { redirect } from 'next/navigation'
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { Wallet, CheckCircle2, TrendingDown, Loader2, ArrowUpRight, ArrowDownLeft, Clock, XCircle, RotateCcw, Monitor } from 'lucide-react'

function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

function formatWIB(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

export default async function DashboardPage() {
  const session = await auth()
  const user = session?.user

  if (!user?.id) redirect('/login')

  // Parallel data fetching via Drizzle
  const [profileRes, installationsCountRes, deductionsRes, activeCountRes, recentTxRes, recentInstRes, freeCreditRes] = await Promise.all([
    // Credit balance
    db.select({ credit_balance: schema.users.creditBalance })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1),
    // Completed installations count
    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.installations)
      .where(and(eq(schema.installations.userId, user.id), eq(schema.installations.status, 'completed'))),
    // Total spent (sum of deduction transactions)
    db.select({ amount: schema.transactions.amount })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.userId, user.id),
        eq(schema.transactions.type, 'deduction'),
        eq(schema.transactions.status, 'completed'),
      )),
    // Active processes (pending + in_progress)
    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.installations)
      .where(and(
        eq(schema.installations.userId, user.id),
        inArray(schema.installations.status, ['pending', 'in_progress']),
      )),
    // Recent transactions
    db.select()
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.userId, user.id),
        inArray(schema.transactions.status, ['pending', 'completed', 'failed', 'expired', 'cancelled']),
      ))
      .orderBy(desc(schema.transactions.updatedAt))
      .limit(10),
    // Recent installations (in_progress + completed + failed)
    db.select()
      .from(schema.installations)
      .where(and(
        eq(schema.installations.userId, user.id),
        inArray(schema.installations.status, ['in_progress', 'completed', 'failed']),
      ))
      .orderBy(desc(schema.installations.updatedAt))
      .limit(10),
    // Free credit tracking (active, not expired)
    db.select({
      amount: schema.freeCreditTracking.amount,
      expiresAt: schema.freeCreditTracking.expiresAt,
      expired: schema.freeCreditTracking.expired,
    })
      .from(schema.freeCreditTracking)
      .where(and(
        eq(schema.freeCreditTracking.userId, user.id),
        eq(schema.freeCreditTracking.expired, false),
      ))
      .limit(1),
  ])

  const creditBalance = Number(profileRes[0]?.credit_balance) || 0
  const freeCredit = freeCreditRes[0]
  const freeCreditAmount = freeCredit ? Number(freeCredit.amount) : 0
  const freeCreditExpiresAt = freeCredit?.expiresAt ? new Date(freeCredit.expiresAt) : null
  const freeCreditDaysLeft = freeCreditExpiresAt ? Math.max(0, Math.ceil((freeCreditExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0
  const completedInstallations = installationsCountRes[0]?.count ?? 0
  const totalSpent = deductionsRes.reduce((sum: number, tx: { amount: string | number }) => sum + Math.abs(Number(tx.amount)), 0)
  const activeProcesses = activeCountRes[0]?.count ?? 0

  // Merge into unified activity feed sorted by updated_at
  type ActivityItem = {
    id: string
    type: 'topup' | 'refund' | 'install' | 'deduction'
    status: string
    amount?: number
    vps_ip?: string
    windows_version?: string
    updated_at: string
  }

  const activities: ActivityItem[] = [
    ...(recentTxRes || []).map((tx: any) => ({
      id: tx.id,
      type: tx.paymentId?.startsWith('refund_') ? 'refund' as const : tx.type === 'deduction' ? 'deduction' as const : 'topup' as const,
      status: tx.status,
      amount: Number(tx.amount),
      updated_at: (tx.updatedAt || tx.createdAt)?.toISOString?.() || String(tx.updatedAt || tx.createdAt),
    })),
    ...(recentInstRes || []).map((inst: any) => ({
      id: inst.id,
      type: 'install' as const,
      status: inst.status,
      vps_ip: inst.vpsIp,
      windows_version: inst.windowsVersion,
      updated_at: (inst.updatedAt || inst.createdAt)?.toISOString?.() || String(inst.updatedAt || inst.createdAt),
    })),
  ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  .slice(0, 10)

  const stats = [
    {
      label: 'Credit Balance',
      value: `Rp ${formatNumber(creditBalance)}`,
      icon: Wallet,
      accent: 'text-emerald-400',
      accentBg: 'bg-emerald-500/10',
    },
    {
      label: 'Success Installations',
      value: completedInstallations.toString(),
      icon: CheckCircle2,
      accent: 'text-blue-400',
      accentBg: 'bg-blue-500/10',
    },
    {
      label: 'Total Spent',
      value: `Rp ${formatNumber(totalSpent)}`,
      icon: TrendingDown,
      accent: 'text-amber-400',
      accentBg: 'bg-amber-500/10',
    },
    {
      label: 'Active Processes',
      value: activeProcesses.toString(),
      icon: Loader2,
      accent: 'text-violet-400',
      accentBg: 'bg-violet-500/10',
    },
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Welcome back
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Here&apos;s an overview of your account
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-5 transition-colors hover:border-gray-700/60"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  {stat.label}
                </span>
                <div className={`${stat.accentBg} rounded-lg p-1.5`}>
                  <Icon className={`size-3.5 ${stat.accent}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-white mt-3 tabular-nums">
                {stat.value}
              </div>
            </div>
          )
        })}
      </div>

      {/* Free Credit Expiry Notice */}
      {freeCredit && freeCreditDaysLeft > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <div className="bg-amber-500/10 rounded-lg p-1.5 mt-0.5">
            <Clock className="size-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm text-amber-200 font-medium">
              Free credit Rp {formatNumber(freeCreditAmount)} expires in {freeCreditDaysLeft} day{freeCreditDaysLeft !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Welcome bonus will be deducted from your balance after expiry. Top up to keep your balance.
            </p>
          </div>
        </div>
      )}
      {freeCredit && freeCreditDaysLeft === 0 && !freeCredit.expired && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3">
          <div className="bg-rose-500/10 rounded-lg p-1.5 mt-0.5">
            <Clock className="size-4 text-rose-400" />
          </div>
          <div>
            <p className="text-sm text-rose-200 font-medium">
              Free credit Rp {formatNumber(freeCreditAmount)} expires today
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Unused welcome bonus will be deducted from your balance soon.
            </p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-800/60">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <p className="text-xs text-gray-500">Top ups, payments, refunds & installations</p>
        </div>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="size-8 mx-auto text-gray-700" />
            <p className="text-sm mt-2 text-gray-500">No activity yet</p>
          </div>
        ) : (
          <div className="px-5">
            {activities.map(item => (
              <div key={`${item.type}-${item.id}`} className="flex items-center justify-between py-3 border-b border-gray-800/40 last:border-b-0">
                <div className="flex items-center gap-3">
                  {/* Icon based on type */}
                  {item.type === 'topup' && (
                    <div className="size-8 rounded-lg flex items-center justify-center" style={{ 
                      background: item.status === 'completed' ? 'rgba(0,245,212,0.1)' :
                                 item.status === 'expired' ? 'rgba(245,158,11,0.1)' :
                                 item.status === 'failed' ? 'rgba(244,63,94,0.1)' :
                                 item.status === 'cancelled' ? 'rgba(107,114,128,0.1)' :
                                 'rgba(59,130,246,0.1)'
                    }}>
                      {item.status === 'completed' ? <ArrowUpRight className="size-4" style={{ color: 'var(--q-accent)' }} /> :
                       item.status === 'expired' ? <Clock className="size-4" style={{ color: 'var(--amber)' }} /> :
                       item.status === 'failed' ? <XCircle className="size-4 text-rose-500" /> :
                       item.status === 'cancelled' ? <XCircle className="size-4 text-gray-500" /> :
                       <Loader2 className="size-4 text-blue-400 animate-spin" />}
                    </div>
                  )}
                  {item.type === 'refund' && (
                    <div className="size-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
                      <RotateCcw className="size-4" style={{ color: 'var(--amber)' }} />
                    </div>
                  )}
                  {item.type === 'deduction' && (
                    <div className="size-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.1)' }}>
                      <ArrowDownLeft className="size-4 text-rose-500" />
                    </div>
                  )}
                  {item.type === 'install' && (
                    <div className="size-8 rounded-lg flex items-center justify-center" style={{ 
                      background: item.status === 'completed' ? 'rgba(34,197,94,0.1)' : 
                                 item.status === 'failed' ? 'rgba(244,63,94,0.1)' : 'rgba(59,130,246,0.1)' 
                    }}>
                      {item.status === 'completed' ? <CheckCircle2 className="size-4 text-emerald-400" /> :
                       item.status === 'failed' ? <XCircle className="size-4 text-red-400" /> :
                       <Loader2 className="size-4 text-blue-400 animate-spin" />}
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-white">
                      {item.type === 'topup' ? 'Top Up' : 
                       item.type === 'refund' ? 'Refund' :
                       item.type === 'deduction' ? 'RDP Payment' :
                       'Install RDP'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.type === 'install' ? `${item.vps_ip} · ${item.windows_version}` : 
                       formatWIB(item.updated_at)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {item.type === 'topup' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{
                        color: item.status === 'completed' ? 'var(--green)' : item.status === 'pending' ? '#3b82f6' : 'var(--text-muted)',
                        textDecoration: (item.status !== 'completed' && item.status !== 'pending') ? 'line-through' : 'none',
                      }}>+Rp {item.amount?.toLocaleString('id-ID')}</span>
                      {item.status === 'pending' && (
                        <>
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400">
                            <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Pending
                          </span>
                          <a href={`/pay/${item.id}`} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                            Pay Now
                          </a>
                        </>
                      )}
                      {item.status !== 'completed' && item.status !== 'pending' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                          item.status === 'expired' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-gray-500/10 text-gray-400'
                        }`}>
                          {item.status === 'failed' ? 'Failed' : item.status === 'expired' ? 'Expired' : 'Cancelled'}
                        </span>
                      )}
                    </div>
                  )}
                  {item.type === 'refund' && (
                    <span className="text-sm font-medium" style={{ color: 'var(--amber)' }}>+Rp {item.amount?.toLocaleString('id-ID')}</span>
                  )}
                  {item.type === 'deduction' && (
                    <span className="text-sm font-medium text-red-400">-Rp {Math.abs(item.amount || 0).toLocaleString('id-ID')}</span>
                  )}
                  {item.type === 'install' && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                      item.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>
                      {item.status === 'completed' ? 'Complete' : 
                       item.status === 'failed' ? 'Failed' : 'Installing'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
