import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, desc, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Popup mode: return all entries with showPopup=true (no pagination)
  if (searchParams.get('popup') === 'true') {
    const data = await db
      .select()
      .from(schema.changelog)
      .where(eq(schema.changelog.showPopup, true))
      .orderBy(desc(schema.changelog.createdAt))

    return NextResponse.json({ success: true, data })
  }

  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  const offset = (page - 1) * limit

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.changelog)

  const total = countResult?.count || 0

  const data = await db
    .select()
    .from(schema.changelog)
    .orderBy(desc(schema.changelog.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const { title, content, category, show_popup } = await request.json()

  try {
    await db.insert(schema.changelog).values({
      title,
      content,
      category,
      showPopup: show_popup || false,
      createdBy: session.user.id,
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    notifyError('/api/admin/changelog', error.message || String(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const { id, show_popup } = await request.json()

  try {
    await db
      .update(schema.changelog)
      .set({ showPopup: show_popup })
      .where(eq(schema.changelog.id, id))
    return NextResponse.json({ success: true })
  } catch (error: any) {
    notifyError('/api/admin/changelog', error.message || String(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const { id } = await request.json()
  await db.delete(schema.changelog).where(eq(schema.changelog.id, id))
  return NextResponse.json({ success: true })
}
