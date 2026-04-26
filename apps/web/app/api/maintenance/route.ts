import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function GET() {
  const [data] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'maintenance'))
    .limit(1)
  return NextResponse.json({ success: true, data: data?.value || { enabled: false, scope: 'none', note: '', show_popup: false } })
}
