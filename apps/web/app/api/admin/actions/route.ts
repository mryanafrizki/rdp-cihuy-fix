import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { action } = body

  try {
    switch (action) {
      case 'topup': {
        if (session.user.role !== 'super_admin') {
          return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
        }

        const { email, amount } = body
        if (!email || !amount || amount <= 0) {
          return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
        }

        // Look up user by email
        const [targetUser] = await db
          .select({ id: schema.users.id, creditBalance: schema.users.creditBalance })
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1)

        if (!targetUser) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const user_id = targetUser.id
        const newBalance = Number(targetUser.creditBalance || 0) + amount

        await db
          .update(schema.users)
          .set({ creditBalance: String(newBalance), updatedAt: sql`now()` })
          .where(eq(schema.users.id, user_id))

        await db.insert(schema.transactions).values({
          userId: user_id,
          type: 'topup',
          amount: String(amount),
          status: 'completed',
          paymentId: 'admin_topup',
        })

        // Log admin topup (fire-and-forget)
        logActivity({
          action: 'admin_topup',
          userId: session.user.id,
          email: session.user.email || 'unknown',
          ...getRequestInfo(request),
          details: { targetUserId: user_id, targetEmail: email, amount },
        }).catch(() => {})

        return NextResponse.json({
          success: true,
          message: 'Top-up successful',
          data: { new_balance: newBalance }
        })
      }

      case 'edit_balance': {
        if (session.user.role !== 'super_admin') {
          return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
        }

        const { email, new_balance } = body
        if (!email || new_balance === undefined || new_balance < 0) {
          return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
        }

        // Look up user by email
        const [targetUser] = await db
          .select({ id: schema.users.id, creditBalance: schema.users.creditBalance })
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1)

        if (!targetUser) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const user_id = targetUser.id

        await db
          .update(schema.users)
          .set({ creditBalance: String(new_balance), updatedAt: sql`now()` })
          .where(eq(schema.users.id, user_id))

        // Log admin edit balance (fire-and-forget)
        logActivity({
          action: 'admin_edit_balance',
          userId: session.user.id,
          email: session.user.email || 'unknown',
          ...getRequestInfo(request),
          details: { targetUserId: user_id, targetEmail: email, amount: new_balance },
        }).catch(() => {})

        return NextResponse.json({
          success: true,
          message: 'Balance updated',
          data: { new_balance }
        })
      }

      case 'delete_user': {
        if (session.user.role !== 'super_admin') {
          return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
        }

        const { email } = body
        if (!email) {
          return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
        }

        // Look up user by email
        const [targetUser] = await db
          .select({ id: schema.users.id, creditBalance: schema.users.creditBalance })
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1)

        if (!targetUser) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const user_id = targetUser.id

        // Delete related records first (cascade should handle this, but be explicit)
        await db.delete(schema.installations).where(eq(schema.installations.userId, user_id))
        await db.delete(schema.transactions).where(eq(schema.transactions.userId, user_id))
        
        await db.delete(schema.users).where(eq(schema.users.id, user_id))

        // Log admin delete user (fire-and-forget)
        logActivity({
          action: 'admin_delete_user',
          userId: session.user.id,
          email: session.user.email || 'unknown',
          ...getRequestInfo(request),
          details: { targetUserId: user_id, targetEmail: email },
        }).catch(() => {})

        return NextResponse.json({
          success: true,
          message: 'User deleted'
        })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: any) {
    notifyError('/api/admin/actions', error.message || String(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
