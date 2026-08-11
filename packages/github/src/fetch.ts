import {
  IssueStorySchema,
  PrStorySchema,
  type GitHubItemRef,
  type IssueStory,
  type LinkedPr,
  type PrStory,
  type TimelineEvent,
} from '@journal/domain'
import { redactSecrets } from './redact'
import { readCachedIssue, readCachedStory, writeCachedStory } from './cache'

export class GitHubImportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    // 'is_pr': the pasted /issues/N URL actually names a pull request —
    // GitHub numbers both in one sequence. The page uses this to offer the
    // PR story instead of a dead end.
    readonly code?: 'is_pr',
  ) {
    super(message)
    this.name = 'GitHubImportError'
  }
}

const API = 'https://api.github.com'
// Pages fetched per evidence list before marking the story truncated.
// 5 pages × 100 items keeps worst-case imports at ~21 requests.
const MAX_PAGES = 5

type GhResponse = { data: any; nextUrl: string | null }

async function gh(pathOrUrl: string): Promise<GhResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'open-source-contribution-journal',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`, {
      headers,
      cache: 'no-store',
    })
  } catch {
    throw new GitHubImportError('The server could not reach GitHub. Try again in a moment.')
  }

  if (res.status === 401) {
    throw new GitHubImportError(
      'GitHub rejected the configured token — the GITHUB_TOKEN in apps/web/.env.local looks invalid or expired. Fix or remove it, then retry.',
      401,
    )
  }
  if (res.status === 404) {
    throw new GitHubImportError(
      'GitHub says this pull request or issue does not exist — or it lives in a private repository. Only public repositories are supported.',
      404,
    )
  }
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      const minutes = Number.isFinite(reset) && reset > 0
        ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000))
        : null
      const wait = minutes === null ? 'a few minutes' : minutes === 1 ? 'about a minute' : `about ${minutes} minutes`
      throw new GitHubImportError(
        `The app's GitHub request budget is used up — try again in ${wait}. (Optional: a GITHUB_TOKEN in apps/web/.env.local raises the limit from 60 to 5,000 requests per hour.)`,
        res.status,
      )
    }
    const retryAfter = Number(res.headers.get('retry-after'))
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      throw new GitHubImportError(
        `GitHub asked the app to slow down — try again in about ${Math.ceil(retryAfter / 60) || 1} minute(s).`,
        res.status,
      )
    }
  }
  if (!res.ok) {
    throw new GitHubImportError(`GitHub returned an unexpected error (HTTP ${res.status}). Try again in a moment.`, res.status)
  }

  const link = res.headers.get('link') ?? ''
  const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/)
  return { data: await res.json(), nextUrl: nextMatch ? nextMatch[1] : null }
}

// Follows Link: rel="next" pagination up to MAX_PAGES. `truncated` reports
// whether more pages existed — silent truncation is forbidden (ADR-0001).
async function ghList(path: string): Promise<{ items: any[]; truncated: boolean }> {
  const items: any[] = []
  let url: string | null = path
  let pages = 0
  while (url && pages < MAX_PAGES) {
    const { data, nextUrl } = await gh(url)
    if (Array.isArray(data)) items.push(...data)
    url = nextUrl
    pages += 1
  }
  return { items, truncated: url !== null }
}

// C0 controls plus invisible Unicode: zero-widths (U+200B–200F), bidi
// embedding/overrides (U+202A–202E), bidi isolates (U+2066–2069), and BOM —
// a right-to-left override in a PR title could visually reverse rendered text.
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}${String.fromCharCode(127)}${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200f)}${String.fromCharCode(0x202a)}-${String.fromCharCode(0x202e)}${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}${String.fromCharCode(0xfeff)}]`,
  'g',
)

// Imported text is untrusted data (SPEC_V0.1 §3.2): redact secrets, strip
// markup noise and control characters, and cap length. Rendering must always
// escape it — this is defense in depth, not the only line.
function clean(text: unknown, max = 240): string | undefined {
  if (typeof text !== 'string') return undefined
  const flat = redactSecrets(text)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Inline HTML tags (bot comments are full of aria-span scaffolding) and
    // markdown table rows flatten into unreadable noise — drop both. The tag
    // pattern requires a tag-name shape so autolinks like <https://…> survive.
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>\n]{0,120})?\/?>/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return undefined
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// GitHub links a PR to the issues it closes via keywords in the PR body
// ("fixes #7", "Closes: #12"). Extracted from the RAW body — clean() may
// truncate past where the keywords sit.
export function extractClosingIssues(body: unknown, selfNumber: number): number[] {
  if (typeof body !== 'string') return []
  const out: number[] = []
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b[:\s]+#(\d{1,9})/gi
  for (const match of body.matchAll(re)) {
    const n = Number(match[1])
    if (Number.isSafeInteger(n) && n > 0 && n !== selfNumber && !out.includes(n)) out.push(n)
    if (out.length >= 20) break
  }
  return out
}

function firstLine(text: unknown, max = 120): string {
  if (typeof text !== 'string') return ''
  return clean(text.split('\n')[0] ?? '', max) ?? ''
}

// URLs are the one field class React's escaping cannot protect (href/src),
// so only https links to GitHub-owned hosts survive import.
function ghLink(value: unknown, assetHost = false): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:') return undefined
    const ok = assetHost
      ? u.hostname === 'github.com' || u.hostname.endsWith('.githubusercontent.com')
      : u.hostname === 'github.com' || u.hostname.endsWith('.github.com')
    return ok ? value : undefined
  } catch {
    return undefined
  }
}

function validTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return undefined
  return value
}

export async function importPr(ref: GitHubItemRef): Promise<PrStory> {
  if (ref.kind !== 'pr') {
    throw new GitHubImportError('This importer handles pull requests — issue refs go through importIssue.')
  }

  const cached = readCachedStory(ref)
  if (cached) return cached

  const base = `/repos/${ref.owner}/${ref.repo}`
  const { data: pr } = await gh(`${base}/pulls/${ref.number}`)
  const [commits, reviews, issueComments, reviewComments] = await Promise.all([
    ghList(`${base}/pulls/${ref.number}/commits?per_page=100`),
    ghList(`${base}/pulls/${ref.number}/reviews?per_page=100`),
    ghList(`${base}/issues/${ref.number}/comments?per_page=100`),
    ghList(`${base}/pulls/${ref.number}/comments?per_page=100`),
  ])

  const events: TimelineEvent[] = []

  const prOpenedAt = validTimestamp(pr.created_at)
  if (prOpenedAt) {
    events.push({
      id: `pr-opened-${pr.id}`,
      kind: 'pr_opened',
      actor: pr.user?.login ?? '[unknown]',
      timestamp: prOpenedAt,
      title: 'opened this pull request',
      detail: clean(pr.body),
      url: ghLink(pr.html_url),
    })
  }

  for (const c of commits.items) {
    // Committer date first: it reflects when a rebased/amended commit was
    // actually (re)written, which is what response-to-feedback windows need.
    const timestamp = validTimestamp(c.commit?.committer?.date) ?? validTimestamp(c.commit?.author?.date)
    if (!timestamp) continue
    events.push({
      id: `commit-${c.sha}`,
      kind: 'commit',
      // The git author-name fallback is free text under the committer's
      // control — it goes through clean() like every other imported string.
      actor: c.author?.login ?? clean(c.commit?.author?.name, 60) ?? '[unknown]',
      timestamp,
      title: firstLine(c.commit?.message) || 'commit',
      url: ghLink(c.html_url),
    })
  }

  const REVIEW_KINDS: Record<string, { kind: TimelineEvent['kind']; title: string }> = {
    APPROVED: { kind: 'review_approved', title: 'approved these changes' },
    CHANGES_REQUESTED: { kind: 'review_changes', title: 'requested changes' },
    COMMENTED: { kind: 'review_commented', title: 'reviewed' },
  }
  for (const r of reviews.items) {
    const meta = REVIEW_KINDS[r.state]
    const timestamp = validTimestamp(r.submitted_at)
    if (!meta || !timestamp) continue
    events.push({
      id: `review-${r.id}`,
      kind: meta.kind,
      actor: r.user?.login ?? '[unknown]',
      timestamp,
      title: meta.title,
      detail: clean(r.body),
      url: ghLink(r.html_url),
    })
  }

  for (const c of issueComments.items) {
    const timestamp = validTimestamp(c.created_at)
    if (!timestamp) continue
    events.push({
      id: `comment-${c.id}`,
      kind: 'comment',
      actor: c.user?.login ?? '[unknown]',
      timestamp,
      title: 'commented',
      detail: clean(c.body),
      url: ghLink(c.html_url),
    })
  }

  for (const c of reviewComments.items) {
    const timestamp = validTimestamp(c.created_at)
    if (!timestamp) continue
    events.push({
      id: `review-comment-${c.id}`,
      kind: 'review_comment',
      actor: c.user?.login ?? '[unknown]',
      timestamp,
      title: c.path ? `commented on ${clean(c.path, 80)}` : 'commented on the diff',
      detail: clean(c.body),
      url: ghLink(c.html_url),
    })
  }

  const mergedAt = validTimestamp(pr.merged_at)
  const closedAt = validTimestamp(pr.closed_at)
  if (mergedAt) {
    events.push({
      id: `merged-${pr.id}`,
      kind: 'merged',
      actor: pr.merged_by?.login ?? '',
      timestamp: mergedAt,
      title: 'merged this pull request',
      url: ghLink(pr.html_url),
    })
  } else if (closedAt) {
    // The pulls payload does not say who closed an unmerged PR; render
    // without an actor rather than inventing '[unknown]'.
    events.push({
      id: `closed-${pr.id}`,
      kind: 'closed',
      actor: '',
      timestamp: closedAt,
      title: 'Pull request closed without merging',
      url: ghLink(pr.html_url),
    })
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const headSha = typeof pr.head?.sha === 'string' && /^[0-9a-fA-F]{7,64}$/.test(pr.head.sha) ? pr.head.sha : ''

  const story = PrStorySchema.parse({
    ref,
    orgId: null,
    title: firstLine(pr.title, 200) || `Pull request #${ref.number}`,
    state: mergedAt ? 'merged' : pr.state === 'open' ? 'open' : 'closed',
    author: pr.user?.login ?? '[unknown]',
    authorAvatarUrl: ghLink(pr.user?.avatar_url, true),
    createdAt: pr.created_at,
    mergedAt: mergedAt ?? null,
    closedAt: closedAt ?? null,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changed_files ?? 0,
    commitCount: typeof pr.commits === 'number' ? pr.commits : commits.items.length,
    headSha,
    baseBranch: clean(pr.base?.ref, 250) ?? '',
    headBranch: clean(pr.head?.ref, 250) ?? '',
    url: ghLink(pr.html_url) ?? `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    truncated: commits.truncated || reviews.truncated || issueComments.truncated || reviewComments.truncated,
    events,
    linkedIssueNumbers: extractClosingIssues(pr.body, ref.number),
  })

  writeCachedStory(ref, story)
  return story
}

export async function importIssue(ref: GitHubItemRef): Promise<IssueStory> {
  if (ref.kind !== 'issue') {
    throw new GitHubImportError('This importer handles issues — pull request refs go through importPr.')
  }

  const cached = readCachedIssue(ref)
  if (cached) return cached

  const base = `/repos/${ref.owner}/${ref.repo}`
  const { data: issue } = await gh(`${base}/issues/${ref.number}`)

  // GitHub numbers issues and pull requests in one shared sequence, and
  // /issues/N happily returns a pull request. Route the caller to the PR
  // story instead of rendering a PR dressed up as an issue.
  if (issue.pull_request) {
    throw new GitHubImportError(
      'That number is a pull request — GitHub counts issues and pull requests together. Open it as a pull request story instead.',
      undefined,
      'is_pr',
    )
  }

  const [comments, timeline] = await Promise.all([
    ghList(`${base}/issues/${ref.number}/comments?per_page=100`),
    ghList(`${base}/issues/${ref.number}/timeline?per_page=100`),
  ])

  const events: TimelineEvent[] = []

  const openedAt = validTimestamp(issue.created_at)
  if (openedAt) {
    events.push({
      id: `issue-opened-${issue.id}`,
      kind: 'issue_opened',
      actor: issue.user?.login ?? '[unknown]',
      timestamp: openedAt,
      // The issue body is the problem statement — give it more room than a
      // passing comment gets.
      title: 'opened this issue',
      detail: clean(issue.body, 400),
      url: ghLink(issue.html_url),
    })
  }

  for (const c of comments.items) {
    const timestamp = validTimestamp(c.created_at)
    if (!timestamp) continue
    events.push({
      id: `comment-${c.id}`,
      kind: 'comment',
      actor: c.user?.login ?? '[unknown]',
      timestamp,
      title: 'commented',
      detail: clean(c.body),
      url: ghLink(c.html_url),
    })
  }

  // Cross-references that are pull requests: the issue's other half. The
  // timeline reports every mention anywhere; only PR mentions with a safe
  // GitHub link become events, deduped per PR number.
  const linkedPrs: LinkedPr[] = []
  const seenPr = new Set<number>()
  for (const t of timeline.items) {
    if (t?.event !== 'cross-referenced') continue
    const src = t.source?.issue
    if (!src || !src.pull_request) continue
    const url = ghLink(src.html_url)
    const timestamp = validTimestamp(t.created_at)
    const number =
      typeof src.number === 'number' && Number.isSafeInteger(src.number) && src.number > 0
        ? src.number
        : null
    if (!url || !timestamp || number === null || seenPr.has(number)) continue
    seenPr.add(number)
    const merged = Boolean(validTimestamp(src.pull_request?.merged_at))
    const state: LinkedPr['state'] =
      merged ? 'merged' : src.state === 'open' ? 'open' : src.state === 'closed' ? 'closed' : 'unknown'
    const title = clean(src.title, 200) ?? `Pull request #${number}`
    if (linkedPrs.length < 10) linkedPrs.push({ number, title, url, state })
    events.push({
      id: `xref-pr-${number}`,
      kind: 'cross_referenced',
      actor: t.actor?.login ?? '[unknown]',
      timestamp,
      title: `linked pull request #${number}: ${title}`,
      url,
    })
  }

  const closedAt = validTimestamp(issue.closed_at)
  if (closedAt) {
    const closer = timeline.items.find((t: any) => t?.event === 'closed')
    const reason = typeof issue.state_reason === 'string' ? issue.state_reason : null
    events.push({
      id: `issue-closed-${issue.id}`,
      kind: 'closed',
      actor: closer?.actor?.login ?? '',
      timestamp: closedAt,
      title:
        reason === 'not_planned'
          ? 'closed this issue as not planned'
          : reason === 'completed'
            ? 'closed this issue as completed'
            : 'closed this issue',
      url: ghLink(issue.html_url),
    })
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const labels = Array.isArray(issue.labels)
    ? issue.labels
        .map((l: any) => clean(typeof l === 'string' ? l : l?.name, 100))
        .filter((s: string | undefined): s is string => Boolean(s))
        .slice(0, 20)
    : []

  const story = IssueStorySchema.parse({
    ref,
    orgId: null,
    title: firstLine(issue.title, 200) || `Issue #${ref.number}`,
    state: issue.state === 'open' ? 'open' : 'closed',
    stateReason: clean(issue.state_reason, 40) ?? null,
    author: issue.user?.login ?? '[unknown]',
    authorAvatarUrl: ghLink(issue.user?.avatar_url, true),
    createdAt: issue.created_at,
    closedAt: closedAt ?? null,
    commentCount: typeof issue.comments === 'number' ? issue.comments : comments.items.length,
    labels,
    linkedPrs,
    url: ghLink(issue.html_url) ?? `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`,
    truncated: comments.truncated || timeline.truncated,
    events,
  })

  writeCachedStory(ref, story)
  return story
}
