import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'

export async function GET() {
  const data = await db
    .select({
      id: schema.osVersions.id,
      name: schema.osVersions.name,
      category: schema.osVersions.category,
    })
    .from(schema.osVersions)
    .where(eq(schema.osVersions.enabled, true))
    .orderBy(asc(schema.osVersions.sortOrder))
  return NextResponse.json({ success: true, data: data || [] })
}
