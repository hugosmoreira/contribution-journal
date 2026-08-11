import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export { contributions, sessions, users } from './schema'
export { schema }

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Lazy singleton so merely importing this package never opens a connection —
 * routes that don't touch the database work with no DATABASE_URL set.
 */
export function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — publishing requires the database (see apps/web/.env.example).')
  }
  if (!cached) {
    // connect_timeout keeps a misconfigured or unreachable database from
    // hanging serverless requests for 15-30s; callers already treat database
    // errors as "not available" and degrade gracefully.
    const client = postgres(process.env.DATABASE_URL, {
      max: 5,
      connect_timeout: 10,
      idle_timeout: 30,
    })
    cached = drizzle(client, { schema })
  }
  return cached
}
