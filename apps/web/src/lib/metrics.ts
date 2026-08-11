import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gte, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { databaseConfigured, db, schema } from '@journal/db'

export type MetricKind = 'import' | 'first_edit' | 'publish' | 'public_view'

// Daily anonymous import allowance per IP (SPEC DoD 11). Generous for real
// use, low enough that a scraping loop hits a wall.
export const DAILY_IMPORT_LIMIT = 50

// The salt is what stops a hashed IP from being reversible by anyone who can
// guess an address — with a public default it is only obfuscation. Development
// keeps a fixed salt so quotas survive restarts; production must supply its own.
let saltWarningLogged = false

function metricsSalt(): string {
  const configured = process.env.METRICS_SALT
  if (configured) return configured
  if (process.env.NODE_ENV === 'production' && !saltWarningLogged) {
    saltWarningLogged = true
    console.warn(
      '[metrics] METRICS_SALT is not set. IP and account hashes are using the ' +
        'default salt published in this repository, so they are not private. ' +
        'Set METRICS_SALT to a long random string.',
    )
  }
  return 'journal-dev-salt'
}

function saltedHash(value: string): string {
  return createHash('sha256').update(`${metricsSalt()}:${value}`).digest('hex').slice(0, 32)
}

/** Salted hash of the caller's IP — never the raw address (privacy-light). */
export async function callerIpHash(): Promise<string | null> {
  try {
    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local'
    return saltedHash(ip)
  } catch {
    return null
  }
}

/**
 * Quota key for signed-in callers: their allowance follows the account, not
 * the network they happen to share (SPEC §3.1 — sign-in lifts the IP quota).
 * The "user:" prefix keeps the keyspace disjoint from IP hashes.
 */
export function userQuotaKey(userId: string): string {
  return saltedHash(`user:${userId}`)
}

/**
 * The single identity key for this caller's metric rows — account when
 * signed in, network otherwise. Using one key for every event kind keeps the
 * §8 return-rate grouping honest and lets account deletion remove every row
 * that belongs to the account (SPEC DoD 10).
 */
export async function callerQuotaKey(userId: string | null): Promise<string | null> {
  return userId ? userQuotaKey(userId) : await callerIpHash()
}

/** Fire-and-forget event insert; instrumentation must never break a page. */
export async function trackEvent(kind: MetricKind, ref: string, ipHash: string | null): Promise<void> {
  if (!databaseConfigured()) return
  try {
    await db()
      .insert(schema.metricEvents)
      .values({ id: randomBytes(12).toString('base64url'), kind, ref: ref.slice(0, 200), ipHash })
  } catch {
    // Metrics are best-effort.
  }
}

/**
 * DISTINCT stories this caller imported since midnight UTC — the quota basis.
 *
 * Distinct, not raw event count: the quota exists to bound GitHub API and
 * model spend, and re-opening a story you already imported costs neither (the
 * story and its drafts are cached). Counting raw views locked people out of
 * their own story for reloading it. Every view is still recorded as a metric
 * event, so the §8 funnel and return-rate numbers are unaffected.
 */
export async function importsToday(ipHash: string | null): Promise<number> {
  if (!databaseConfigured() || !ipHash) return 0
  try {
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const rows = await db()
      .select({ count: sql<number>`count(distinct ${schema.metricEvents.ref})::int` })
      .from(schema.metricEvents)
      .where(
        and(
          eq(schema.metricEvents.kind, 'import'),
          eq(schema.metricEvents.ipHash, ipHash),
          gte(schema.metricEvents.createdAt, startOfDay),
        ),
      )
    return rows[0]?.count ?? 0
  } catch {
    return 0
  }
}
