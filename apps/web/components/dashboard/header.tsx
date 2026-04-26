'use client'

import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/topup': 'Top Up',
  '/dashboard/order': 'Install RDP',
  '/dashboard/installations': 'Installations',
  '/dashboard/transactions': 'Transactions',
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

interface HeaderProps {
  userEmail?: string
  creditBalance?: number
}

export function Header({ userEmail, creditBalance }: HeaderProps) {
  const pathname = usePathname()
  const title = pageTitles[pathname] || 'Dashboard'

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <header className="hidden md:flex h-14 border-b border-gray-800/60 bg-gray-950/50 backdrop-blur-md items-center justify-between px-8 shrink-0">
      <h2 className="text-sm font-medium text-gray-300">{title}</h2>
      {userEmail && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-gray-500 truncate max-w-[200px]">{userEmail}</div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--q-accent, #00f5d4)' }}>
              Rp {formatNumber(creditBalance ?? 0)}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-red-400 transition-colors duration-150 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <LogOut className="size-3.5" />
            Logout
          </button>
        </div>
      )}
    </header>
  )
}
