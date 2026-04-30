import { auth } from '@/lib/auth-config'
import { db, schema } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { notifyError } from '@/lib/telegram-notify'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await db
    .select()
    .from(schema.osVersions)
    .orderBy(asc(schema.osVersions.sortOrder))

  return NextResponse.json({ success: true, data })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const { id, name, category } = await request.json()

  try {
    await db.insert(schema.osVersions).values({
      id,
      name,
      category: category || 'desktop',
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    notifyError('/api/admin/os-versions', error.message || String(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const { id, name, category, enabled } = await request.json()

  try {
    await db
      .update(schema.osVersions)
      .set({ name, category, enabled })
      .where(eq(schema.osVersions.id, id))
    return NextResponse.json({ success: true })
  } catch (error: any) {
    notifyError('/api/admin/os-versions', error.message || String(error))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const { id } = await request.json()
  await db.delete(schema.osVersions).where(eq(schema.osVersions.id, id))
  return NextResponse.json({ success: true })
}
