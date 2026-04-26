'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Receipt, Server, Wrench, Settings, Megaphone, Monitor, Activity, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/transactions', label: 'Transactions', icon: Receipt },
  { href: '/admin/installations', label: 'Installations', icon: Server },
  { href: '/admin/os-versions', label: 'OS Versions', icon: Monitor },
  { href: '/admin/activity', label: 'Activity', icon: Activity },
  { href: '/admin/actions', label: 'Manual Actions', icon: Wrench },
  { href: '/admin/changelog', label: 'Changelog', icon: Megaphone },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Prevent body scroll when mobile menu is open + Escape key handler
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setMobileOpen(false)
      }
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleEscape)
      }
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const navContent = (
    <>
      <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-slate-800 flex items-center justify-between">
        <h1 className="text-base lg:text-lg font-semibold text-white">Admin Panel</h1>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="size-5" />
        </button>
      </div>
      
      <nav className="flex-1 p-2 lg:p-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 lg:py-2.5 rounded-lg transition-colors text-sm',
                isActive
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-slate-900 border border-slate-800 text-white shadow-lg"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 xl:w-60 bg-slate-900 border-r border-slate-800 flex-col shrink-0">
        {navContent}
      </aside>
    </>
  )
}
