'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CreditCard, Server, Monitor, Receipt, Zap, Shield, Megaphone, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from 'next-auth/react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard/topup', label: 'Top Up', icon: CreditCard },
  { href: '/dashboard/order', label: 'Install RDP', icon: Server },
  { href: '/dashboard/installations', label: 'Installations', icon: Monitor },
  { href: '/dashboard/transactions', label: 'Transactions', icon: Receipt },
  { href: '/dashboard/cloud', label: 'Cloud', icon: Cloud },
  { href: '/dashboard/authentication', label: 'Authentication', icon: Shield },
  { href: '/dashboard/changelog', label: 'Changelog', icon: Megaphone },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
  serverRole?: string
}

export function Sidebar({ mobileOpen = false, onMobileClose, serverRole }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  // Use server-provided role as primary (reliable), fallback to client session
  const role = serverRole || session?.user?.role
  const isAdmin = role === 'admin' || role === 'super_admin'

  const handleNavClick = useCallback(() => {
    onMobileClose?.()
  }, [onMobileClose])

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-gray-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15">
            <Zap className="size-4 text-blue-400" />
          </div>
          <span className="text-base font-semibold tracking-tight text-white">Cobain</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.1)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}

        {/* Admin link */}
        {isAdmin && (
          <>
            <div className="my-2 border-t border-gray-800/80" />
            <Link
              href="/admin"
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                pathname.startsWith('/admin')
                  ? 'bg-amber-600/10 text-amber-400 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.1)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              )}
            >
              <Shield className="size-[18px] shrink-0" />
              <span>Admin Panel</span>
            </Link>
          </>
        )}
      </nav>

      {/* Spacer at bottom */}
      <div className="p-4 border-t border-gray-800/80">
        <div className="text-[11px] text-gray-600">v1.1</div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile sidebar overlay + drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={onMobileClose}
            />

            {/* Slide-in sidebar */}
            <motion.aside
              key="sidebar-mobile"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-gray-900/95 backdrop-blur-xl border-r border-gray-800/80 flex flex-col md:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar — always visible */}
      <aside className="hidden md:flex w-64 bg-gray-900/80 border-r border-gray-800/80 flex-col shrink-0">
        {sidebarContent}
      </aside>
    </>
  )
}
