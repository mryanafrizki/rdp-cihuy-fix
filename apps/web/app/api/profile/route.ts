import { auth } from '@/lib/auth-config'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity-logger'
import { getRequestInfo } from '@/lib/request-info'
import { notifyError } from '@/lib/telegram-notify'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const [data] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        credit_balance: schema.users.creditBalance,
        created_at: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .limit(1)
    
    if (!data) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true, data: { ...data, credit_balance: Number(data.credit_balance) || 0 } })
  } catch (error: any) {
    notifyError('/api/profile', error.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await auth()
  
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  
  // Email changes are not allowed via profile update (requires re-verification)
  // Only non-sensitive fields can be updated here
  return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })

  // Kept for future use if needed with re-verification flow
  try {
    const [data] = await db
      .update(schema.users)
      .set({})
      .where(eq(schema.users.id, session.user.id))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        credit_balance: schema.users.creditBalance,
        created_at: schema.users.createdAt,
      })
    
    if (!data) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Log profile update (fire-and-forget)
    logActivity({
      action: 'profile_update',
      userId: session.user.id,
      email: session.user.email || 'unknown',
      ...getRequestInfo(request),
      details: { changes: updates },
    }).catch(() => {})
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    notifyError('/api/profile', error.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
