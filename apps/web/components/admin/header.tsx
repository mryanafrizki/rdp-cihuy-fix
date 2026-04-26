'use client'

import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from 'next-auth/react'

interface AdminHeaderProps {
  userEmail: string
}

export function AdminHeader({ userEmail }: AdminHeaderProps) {
  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <header className="h-12 lg:h-14 border-b border-border bg-slate-900 flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3 lg:gap-6 min-w-0">
        {/* Spacer for mobile hamburger button */}
        <div className="w-8 lg:hidden" />
        <h2 className="text-sm lg:text-base font-semibold text-white shrink-0">Admin Panel</h2>
        <div className="text-xs lg:text-sm truncate hidden sm:block">
          <span className="text-slate-400">Logged in as:</span>
          <span className="ml-1.5 font-medium text-white">{userEmail}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="gap-1.5 border-slate-700 text-white hover:bg-slate-800 text-xs lg:text-sm h-8 lg:h-9 px-2.5 lg:px-3"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  )
}
