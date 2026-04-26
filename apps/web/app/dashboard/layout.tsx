import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { auth } from '@/lib/auth-config'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { MaintenancePopup } from '@/components/ui/maintenance-popup'
import { ChangelogPopup } from '@/components/ui/changelog-popup'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const user = session?.user

  if (!user?.id) {
    redirect('/login')
  }

  // Check maintenance mode
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const maintenanceRes = await fetch(`${siteUrl}/api/maintenance`, { cache: 'no-store' })
    const maintenance = await maintenanceRes.json()
    const mData = maintenance.data
    if (mData?.enabled) {
      const scope = Array.isArray(mData.scope) ? mData.scope : [mData.scope]
      if (scope.includes('all')) {
        const role = user.role || ''
        if (!['admin', 'super_admin'].includes(role)) {
          // Auth.js signOut requires redirect, so just redirect to maintenance
          redirect('/maintenance')
        }
      }
    }
  } catch {
    // Non-fatal: if maintenance check fails, allow access
  }

  // Fetch user profile for credit balance
  const [profile] = await db
    .select({ credit_balance: schema.users.creditBalance })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1)

  const creditBalance = Number(profile?.credit_balance) || 0

  return (
    <DashboardShell userEmail={user.email || ''} creditBalance={creditBalance} userRole={user.role || 'user'}>
      <MaintenancePopup />
      <ChangelogPopup />
      {children}
    </DashboardShell>
  )
}
