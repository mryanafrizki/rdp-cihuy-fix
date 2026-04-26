import { auth } from '@/lib/auth-config'
import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { toSnake } from '@/lib/utils'

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  
  const { id } = await ctx.params
  
  // Query single installation by id AND user_id (security)
  const [data] = await db
    .select()
    .from(schema.installations)
    .where(and(
      eq(schema.installations.id, id),
      eq(schema.installations.userId, session.user.id)
    ))
    .limit(1)
  
  if (!data) {
    return NextResponse.json({ success: false, error: 'Installation not found' }, { status: 404 })
  }
  
  // Add credentials (password is NOT stored in DB)
  const response = {
    ...data,
    credentials: {
      ip: data.vpsIp,
      username: 'Administrator',
      password: '***Password shown once after installation completion***',
      port: 22
    }
  }
  
  return NextResponse.json({
    success: true,
    data: toSnake(response as Record<string, unknown>)
  })
}
