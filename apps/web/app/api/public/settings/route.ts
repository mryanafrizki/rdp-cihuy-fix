import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { inArray } from 'drizzle-orm'

export async function GET() {
  const data = await db
    .select({ key: schema.appSettings.key, value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(inArray(schema.appSettings.key, ['install_price', 'fee_mode']))
  const settings: Record<string, any> = {}
  data?.forEach((row: { key: string; value: unknown }) => { settings[row.key] = row.value })
  return NextResponse.json({ success: true, data: settings })
}
