import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { auth } from '@/lib/auth-config'
import { redirect } from 'next/navigation'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const user = session?.user

  if (!user?.id) {
    redirect('/login')
  }

  // Check admin role from session (set by Auth.js JWT callback)
  const role = user.role || ''
  if (!['admin', 'super_admin'].includes(role)) {
    redirect('/dashboard')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AdminHeader userEmail={user.email || ''} />
        <main className="flex-1 p-3 lg:p-5 xl:p-6 overflow-auto bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  )
}
