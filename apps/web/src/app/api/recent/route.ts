import { NextResponse } from 'next/server'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { databaseConfigured, db, schema } from '@journal/db'
import { agentQuotaKey, apiTokenConfigured, authorizeRequest } from '../../../lib/api-token'

export const dynamic = 'force-dynamic'

/**
 * "What did I work on?" — the question the whole product exists to answer.
 * Returns the stories this agent captured, most recent first, so an agent
 * can remind its author what the day contained.
 */
export async function GET(request: Request) {
  if (!apiTokenConfigured()) {
    return NextResponse.json({ ok: false, error: 'Agent capture is not enabled on this server.' }, { status: 503 })
  }
  if (!authorizeRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  if (!databaseConfigured()) {
    return NextResponse.json({
      ok: true,
      stories: [],
      note: 'No database configured, so captures are not recorded. Stories still work by URL.',
    })
  }

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10) || 10, 1), 50)
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 7) || 7, 1), 90)
  const since = new Date(Date.now() - days * 86_400_000)

  try {
    const rows = await db()
      .select({
        ref: schema.metricEvents.ref,
        lastSeen: sql<string>`max(${schema.metricEvents.createdAt})`,
      })
      .from(schema.metricEvents)
      .where(
        and(
          eq(schema.metricEvents.kind, 'import'),
          eq(schema.metricEvents.ipHash, agentQuotaKey()),
          gte(schema.metricEvents.createdAt, since),
        ),
      )
      .groupBy(schema.metricEvents.ref)
      .orderBy(desc(sql`max(${schema.metricEvents.createdAt})`))
      .limit(limit)

    const origin = process.env.JOURNAL_BASE_URL ?? url.origin
    const stories = rows.map((row) => {
      // ref is "owner/repo#number", written by this app — parse defensively.
      const match = /^([^/]+)\/([^#]+)#(\d+)$/.exec(row.ref)
      return {
        ref: row.ref,
        capturedAt: row.lastSeen,
        storyUrl: match ? new URL(`/story/${match[1]}/${match[2]}/${match[3]}`, origin).toString() : null,
      }
    })
    return NextResponse.json({ ok: true, stories, days })
  } catch (err) {
    console.error('[recent] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, error: 'Could not read recent captures.' }, { status: 500 })
  }
}
