'use server'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { and, eq, gte, sql } from 'drizzle-orm'
import { SESSION_COOKIE } from '@journal/auth'
import { GitHubItemRefSchema, type GitHubItemRef } from '@journal/domain'
import { importIssue, importPr } from '@journal/github'
import { contributions, databaseConfigured, db, schema, users } from '@journal/db'
import {
  IssueMapsSchema,
  JourneyMapsSchema,
  MapsSchema,
  PublishKindSchema,
  type PublishKind,
} from '../lib/published'
import { loadJourney } from '../lib/journey'
import { callerIpHash, callerQuotaKey, trackEvent, userQuotaKey } from '../lib/metrics'
import { destroySessionRow, getSession, type SessionUser } from '../lib/auth'

const VisibilitySchema = z.enum(['unlisted', 'public'])
const TokenSchema = z.string().min(16).max(128).nullable()

// Anonymous-abuse guards until sign-in: per-IP daily publish allowance,
// a global row circuit breaker, and a byte ceiling on client-supplied maps.
// Signed-in callers get the same daily allowance keyed on their account
// instead of their IP (rescues shared-IP users, still bounds abuse).
const DAILY_PUBLISH_LIMIT = 10
const MAX_PUBLISHED_ROWS = Number(process.env.JOURNAL_MAX_PUBLISHED_ROWS ?? 10_000)
const MAX_MAPS_BYTES = 300_000

export type PublishResult =
  | { ok: true; slug: string; ownerToken: string | null }
  | { ok: false; code: 'not_owner' | 'not_configured' | 'rate_limited' | 'incomplete_map' | 'error' }

export type UnpublishResult = { ok: true } | { ok: false; code: 'not_owner' | 'not_configured' | 'error' }

export type PublishStateResult =
  | { published: false }
  | { published: true; owned: false; claimable: boolean }
  | { published: true; owned: true; slug: string; visibility: 'private' | 'unlisted' | 'public' }

export type ClaimResult =
  | { ok: true }
  | { ok: false; code: 'signed_out' | 'not_found' | 'not_author' | 'not_configured' | 'error' }

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function tokenMatches(token: string | null, storedHash: string | null): boolean {
  if (!token || !storedHash) return false
  const a = Buffer.from(hashToken(token))
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Deployment-owner override for takedowns of squatted/abusive rows. */
function isAdminToken(token: string | null): boolean {
  const admin = process.env.JOURNAL_ADMIN_TOKEN
  if (!admin || admin.length < 16 || !token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(admin)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Ownership resolution (SPEC §3.9): an account owner is whoever the row's
 * ownerUserId names; the anonymous token keeps working alongside it so the
 * publishing browser stays in control even after signing out. When the
 * proven PR author claims a row, the claim NULLs ownerTokenHash — that is
 * the moment a squatter's token dies.
 */
function callerOwns(
  row: { ownerUserId: string | null; ownerTokenHash: string | null },
  token: string | null,
  session: SessionUser | null,
): boolean {
  if (row.ownerUserId && session && session.userId === row.ownerUserId) return true
  return tokenMatches(token, row.ownerTokenHash)
}

/** The author recorded in the row's server-imported story. Journey rows
 * store a bundle; the issue reporter is the claimable author there. */
function storyAuthor(row: { story: unknown }): string {
  let story = row.story
  if (story && typeof story === 'object' && 'issue' in story) {
    story = (story as { issue: unknown }).issue
  }
  if (story && typeof story === 'object' && 'author' in story) {
    const author = (story as { author: unknown }).author
    if (typeof author === 'string') return author
  }
  return ''
}

function authorMatches(row: { story: unknown }, session: SessionUser | null): boolean {
  const author = storyAuthor(row)
  return Boolean(session && author && author.toLowerCase() === session.login.toLowerCase())
}

/** GitHub treats owner/repo case-insensitively; storage must too. */
function canonicalRef(input: unknown): GitHubItemRef {
  const ref = GitHubItemRefSchema.parse(input)
  return { ...ref, owner: ref.owner.toLowerCase(), repo: ref.repo.toLowerCase() }
}

function findByRef(ref: GitHubItemRef, kind: PublishKind) {
  return db().query.contributions.findFirst({
    where: and(
      eq(contributions.owner, ref.owner),
      eq(contributions.repo, ref.repo),
      eq(contributions.number, String(ref.number)),
      eq(contributions.kind, kind),
    ),
  })
}

/** A publish kind is only valid for the ref shape it belongs to: PR stories
 * publish from PR refs; issue stories and journeys from issue refs. */
function kindMatchesRef(kind: PublishKind, ref: GitHubItemRef): boolean {
  return kind === 'pr' ? ref.kind === 'pr' : ref.kind === 'issue'
}

// SPEC_V0.1 §3.3b: the published map's core spine must exist. The drafts
// always include these, so this only rejects maps the user actively gutted.
// Issue maps may honestly lack a fix (nothing shipped yet) — they need the
// problem and the outcome; PR and journey maps need the full spine.
function primaryMapComplete(kind: PublishKind, maps: Record<string, unknown>): boolean {
  const primary =
    kind === 'pr' ? maps.problemSolution : kind === 'issue' ? maps.issueExploration : maps.journey
  const nodes = (primary as { nodes?: Array<{ kind: string }> } | undefined)?.nodes ?? []
  const kinds = new Set(nodes.map((n) => n.kind))
  if (kind === 'issue') return kinds.has('symptom') && kinds.has('outcome')
  return kinds.has('symptom') && kinds.has('fix') && kinds.has('outcome')
}

function parseMaps(kind: PublishKind, mapsInput: unknown): Record<string, unknown> {
  if (kind === 'issue') return IssueMapsSchema.parse(mapsInput)
  if (kind === 'journey') return JourneyMapsSchema.parse(mapsInput)
  return MapsSchema.parse(mapsInput)
}

/** Server-side re-import per kind — clients supply edited maps, never a
 * forged story payload (SPEC_V0.1 §3.7). */
async function importForPublish(
  kind: PublishKind,
  ref: GitHubItemRef,
): Promise<{ payload: unknown; title: string; state: string }> {
  if (kind === 'pr') {
    const story = await importPr(ref)
    return { payload: story, title: story.title, state: story.state }
  }
  if (kind === 'issue') {
    const story = await importIssue(ref)
    return { payload: story, title: story.title, state: story.state }
  }
  const journey = await loadJourney(ref)
  if (journey.prs.length === 0) {
    // A journey without its PR half is just an issue story — refuse rather
    // than publish a bundle that renders half-empty.
    throw new Error('journey has no importable same-repo pull requests')
  }
  return { payload: journey, title: journey.issue.title, state: journey.issue.state }
}

function refLabel(kind: PublishKind, ref: GitHubItemRef): string {
  const prefix = kind === 'pr' ? '' : `${kind}-`
  return `${ref.owner}/${ref.repo}#${prefix}${ref.number}`
}

function startOfTodayUtc(): Date {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  return start
}

async function publishesTodayByIp(ipHash: string | null): Promise<number> {
  if (!ipHash) return 0
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(contributions)
    .where(and(eq(contributions.publisherIpHash, ipHash), gte(contributions.createdAt, startOfTodayUtc())))
  return rows[0]?.count ?? 0
}

async function publishesTodayByUser(userId: string): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(contributions)
    .where(and(eq(contributions.ownerUserId, userId), gte(contributions.createdAt, startOfTodayUtc())))
  return rows[0]?.count ?? 0
}

/**
 * Publishing is an explicit action; nothing is public by default
 * (SPEC_V0.1 §3.7). The story itself is re-imported server-side — clients
 * can only supply their edited maps, never a forged story. The publishing
 * browser receives an anonymous ownership token; signed-in publishers also
 * get the row attached to their account so it follows them across devices.
 */
export async function publishStory(
  refInput: unknown,
  kindInput: unknown,
  mapsInput: unknown,
  visibilityInput: unknown,
  tokenInput: unknown,
): Promise<PublishResult> {
  try {
    if (!databaseConfigured()) return { ok: false, code: 'not_configured' }
    const ref = canonicalRef(refInput)
    const kind = PublishKindSchema.parse(kindInput ?? 'pr')
    if (!kindMatchesRef(kind, ref)) return { ok: false, code: 'error' }
    if (typeof mapsInput === 'object' && JSON.stringify(mapsInput).length > MAX_MAPS_BYTES) {
      return { ok: false, code: 'error' }
    }
    const maps = parseMaps(kind, mapsInput)
    const visibility = VisibilitySchema.parse(visibilityInput)
    const token = TokenSchema.parse(tokenInput ?? null)
    if (!primaryMapComplete(kind, maps)) return { ok: false, code: 'incomplete_map' }

    const session = await getSession()
    const ipHash = await callerIpHash()
    const database = db()

    const existing = await findByRef(ref, kind)
    if (existing) {
      if (!callerOwns(existing, token, session)) return { ok: false, code: 'not_owner' }
      const { payload, title, state } = await importForPublish(kind, ref)
      const slug = existing.shareSlug ?? randomBytes(9).toString('base64url')
      await database
        .update(contributions)
        .set({
          story: payload,
          maps,
          visibility,
          title,
          state,
          shareSlug: slug,
          // A signed-in update attaches an anonymous row to the account.
          ownerUserId: existing.ownerUserId ?? session?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(contributions.id, existing.id))
      return { ok: true, slug, ownerToken: token }
    }

    // First publish: abuse guards apply, keyed per-account when signed in.
    const usedToday = session ? await publishesTodayByUser(session.userId) : await publishesTodayByIp(ipHash)
    if (usedToday >= DAILY_PUBLISH_LIMIT) return { ok: false, code: 'rate_limited' }
    const totalRows = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(contributions)
    if ((totalRows[0]?.count ?? 0) >= MAX_PUBLISHED_ROWS) return { ok: false, code: 'rate_limited' }

    const { payload, title, state } = await importForPublish(kind, ref)
    const slug = randomBytes(9).toString('base64url')
    const ownerToken = randomBytes(24).toString('base64url')
    // The unique (owner, repo, number, kind) index makes a concurrent
    // first-publish race collapse to one row; the loser lands in the
    // conflict branch.
    const inserted = await database
      .insert(contributions)
      .values({
        id: randomBytes(12).toString('base64url'),
        orgId: null,
        owner: ref.owner,
        repo: ref.repo,
        number: String(ref.number),
        kind,
        title,
        state,
        visibility,
        shareSlug: slug,
        ownerTokenHash: hashToken(ownerToken),
        ownerUserId: session?.userId ?? null,
        publisherIpHash: ipHash,
        story: payload,
        maps,
      })
      .onConflictDoNothing({
        target: [contributions.owner, contributions.repo, contributions.number, contributions.kind],
      })
      .returning({ id: contributions.id })
    if (inserted.length === 0) {
      // Lost the race — someone else owns the row now.
      return { ok: false, code: 'not_owner' }
    }
    void trackEvent('publish', refLabel(kind, ref), session ? userQuotaKey(session.userId) : ipHash)
    return { ok: true, slug, ownerToken }
  } catch (err) {
    console.error('[publish] failed:', err instanceof Error ? err.message : err)
    return { ok: false, code: 'error' }
  }
}

/** Hard delete — the row is gone, the share link dies (SPEC_V0.1 §3.9). */
export async function unpublishStory(
  refInput: unknown,
  kindInput: unknown,
  tokenInput: unknown,
): Promise<UnpublishResult> {
  try {
    if (!databaseConfigured()) return { ok: false, code: 'not_configured' }
    const ref = canonicalRef(refInput)
    const kind = PublishKindSchema.parse(kindInput ?? 'pr')
    const token = TokenSchema.parse(tokenInput ?? null)
    const existing = await findByRef(ref, kind)
    if (!existing) return { ok: true }
    const session = await getSession()
    if (!callerOwns(existing, token, session) && !isAdminToken(token)) {
      return { ok: false, code: 'not_owner' }
    }
    await db().delete(contributions).where(eq(contributions.id, existing.id))
    return { ok: true }
  } catch (err) {
    console.error('[unpublish] failed:', err instanceof Error ? err.message : err)
    return { ok: false, code: 'error' }
  }
}

/**
 * Publish state for the editor UI. The share slug is revealed ONLY to owners
 * (token or account) — handing an unlisted slug to every visitor of the
 * editor page would defeat "unlisted". Non-owners additionally learn whether
 * THEY could claim the row as the story's proven author.
 */
export async function publishState(
  refInput: unknown,
  kindInput: unknown,
  tokenInput: unknown,
): Promise<PublishStateResult> {
  try {
    if (!databaseConfigured()) return { published: false }
    const ref = canonicalRef(refInput)
    const kind = PublishKindSchema.parse(kindInput ?? 'pr')
    const token = TokenSchema.parse(tokenInput ?? null)
    const existing = await findByRef(ref, kind)
    if (!existing || !existing.shareSlug) return { published: false }
    const session = await getSession()
    if (!callerOwns(existing, token, session)) {
      return { published: true, owned: false, claimable: authorMatches(existing, session) }
    }
    return { published: true, owned: true, slug: existing.shareSlug, visibility: existing.visibility }
  } catch {
    return { published: false }
  }
}

/**
 * The anti-squatting flow (SPEC §3.9): the signed-in user proves they are
 * the PR author — the author login comes from the server-imported story,
 * never from the client — and takes the row over. The previous anonymous
 * token is invalidated in the same stroke.
 */
export async function claimStory(refInput: unknown, kindInput: unknown): Promise<ClaimResult> {
  try {
    if (!databaseConfigured()) return { ok: false, code: 'not_configured' }
    const ref = canonicalRef(refInput)
    const kind = PublishKindSchema.parse(kindInput ?? 'pr')
    const session = await getSession()
    if (!session) return { ok: false, code: 'signed_out' }
    const existing = await findByRef(ref, kind)
    if (!existing) return { ok: false, code: 'not_found' }
    if (existing.ownerUserId === session.userId) return { ok: true }
    if (!authorMatches(existing, session)) return { ok: false, code: 'not_author' }
    await db()
      .update(contributions)
      .set({ ownerUserId: session.userId, ownerTokenHash: null, updatedAt: new Date() })
      .where(eq(contributions.id, existing.id))
    return { ok: true }
  } catch (err) {
    console.error('[claim] failed:', err instanceof Error ? err.message : err)
    return { ok: false, code: 'error' }
  }
}

/**
 * Silently attaches a row the caller already controls (their anonymous
 * ownership token) to their signed-in account, so anonymous publishes are
 * claimable on sign-in (SPEC §3.9). The token keeps working — attaching
 * adds an owner, it never locks the publishing browser out.
 */
export async function attachOwnership(
  refInput: unknown,
  kindInput: unknown,
  tokenInput: unknown,
): Promise<void> {
  try {
    if (!databaseConfigured()) return
    const session = await getSession()
    if (!session) return
    const ref = canonicalRef(refInput)
    const kind = PublishKindSchema.parse(kindInput ?? 'pr')
    const token = TokenSchema.parse(tokenInput ?? null)
    const existing = await findByRef(ref, kind)
    if (!existing || existing.ownerUserId || !tokenMatches(token, existing.ownerTokenHash)) return
    await db()
      .update(contributions)
      .set({ ownerUserId: session.userId, updatedAt: new Date() })
      .where(eq(contributions.id, existing.id))
  } catch {
    // Attach is best-effort; the token still owns the row.
  }
}

export async function signOut(): Promise<void> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (token && databaseConfigured()) await destroySessionRow(token)
    store.delete(SESSION_COOKIE)
  } catch (err) {
    console.error('[auth] sign-out failed:', err instanceof Error ? err.message : err)
  }
}

/**
 * Hard delete of the entire account (SPEC DoD 10): the user row cascades to
 * sessions and every owned contribution, and the account's quota/metric
 * rows go with it. Nothing is soft-deleted.
 */
export async function deleteAccount(): Promise<{ ok: boolean }> {
  try {
    if (!databaseConfigured()) return { ok: false }
    const session = await getSession()
    if (!session) return { ok: false }
    await db()
      .delete(schema.metricEvents)
      .where(eq(schema.metricEvents.ipHash, userQuotaKey(session.userId)))
    await db().delete(users).where(eq(users.id, session.userId))
    const store = await cookies()
    store.delete(SESSION_COOKIE)
    return { ok: true }
  } catch (err) {
    console.error('[auth] account deletion failed:', err instanceof Error ? err.message : err)
    return { ok: false }
  }
}

/**
 * Records the first real edit of a map for this story — the "completed story"
 * signal in the import → completed funnel.
 */
export async function trackFirstEdit(refInput: unknown): Promise<void> {
  try {
    const ref = canonicalRef(refInput)
    const session = await getSession()
    // Issues and PRs share GitHub's number sequence; the label keys them
    // apart so the funnel never conflates issue #5 with PR #5.
    await trackEvent(
      'first_edit',
      `${ref.owner}/${ref.repo}#${ref.kind === 'issue' ? 'issue-' : ''}${ref.number}`,
      await callerQuotaKey(session?.userId ?? null),
    )
  } catch {
    // Instrumentation must never surface an error to the editor.
  }
}
