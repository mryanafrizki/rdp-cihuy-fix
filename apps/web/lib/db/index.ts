import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

// Main query client (pooled, for normal operations)
const client = postgres(connectionString)

export const db = drizzle(client, { schema })
export { schema }
export type Database = typeof db
