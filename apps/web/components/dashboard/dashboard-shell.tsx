'use client'

import { useState, useCallback, useEffect } from 'react'
import { Menu, LogOut } from 'lucide-react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { ToastContainer } from '@/components/ui/toast-notification'
import { signOut } from 'next-auth/react'

interface DashboardShellProps {
  userEmail: string
  creditBalance: number
  userRole?: string
  children: React.ReactNode
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

export function DashboardShell({ userEmail, creditBalance: initialBalance, userRole, children }: DashboardShellProps) {
  const [creditBalance, setCreditBalance] = useState(initialBalance)

  // Poll balance every 10s for live updates
  useEffect(() => {
    const poll = () => {
      fetch('/api/profile').then(r => r.json()).then(d => {
        if (d.success && d.data?.credit_balance !== undefined) {
          setCreditBalance(d.data.credit_balance)
        }
      }).catch(() => {})
    }
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [])
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setMobileOpen((prev) => !prev)
  }, [])

  const closeSidebar = useCallback(() => {
    setMobileOpen(false)
  }, [])

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <ToastContainer />
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={closeSidebar}
        serverRole={userRole}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile header — visible only on mobile */}
        <div
          className="md:hidden flex items-center justify-between p-4 gap-3"
          style={{
            background: 'var(--surface-1)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <button
            onClick={toggleSidebar}
            className="p-1 -m-1 text-white hover:text-gray-300 transition-colors shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <span className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
              Cobain
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-gray-500 truncate max-w-[120px]">{userEmail}</div>
              <div className="text-xs font-semibold tabular-nums" style={{ color: 'var(--q-accent, #00f5d4)' }}>
                Rp {formatNumber(creditBalance)}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-gray-500 hover:text-red-400 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)' }}
              aria-label="Logout"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Desktop header */}
        <Header userEmail={userEmail} creditBalance={creditBalance} />

        <main className="flex-1 overflow-auto p-5 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
