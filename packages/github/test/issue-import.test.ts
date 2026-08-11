import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { GitHubImportError } from '../src/fetch'
import { importIssue } from '../src/fetch'

// Own cache dir: import.test.ts wipes its cache in a parallel worker, and
// two files rm-ing the same tree races (ENOTEMPTY on CI's Linux, EPERM on
// Windows). vi.hoisted runs before ../src/fetch loads cache.ts, which
// freezes the cache path at module scope.
const CACHE_DIR = vi.hoisted(() => {
  const dir = `.cache-test-issue-import-${process.pid}`
  process.env.JOURNAL_CACHE_DIR = dir
  return dir
})

const REF = { owner: 'o', repo: 'r', number: 7, kind: 'issue' as const }

const ISSUE = {
  id: 4100,
  number: 7,
  user: { login: 'reporter', avatar_url: 'https://avatars.githubusercontent.com/u/2' },
  html_url: 'https://github.com/o/r/issues/7',
  title: 'Duplicate webhook deliveries under retries',
  body: 'Customers receive the same webhook twice when retries overlap.',
  state: 'closed',
  state_reason: 'completed',
  created_at: '2026-07-01T09:00:00Z',
  closed_at: '2026-07-05T12:00:00Z',
  comments: 2,
  labels: [{ name: 'bug' }, { name: 'area: webhooks' }, 'plain-string-label'],
}

const COMMENTS = [
  {
    id: 51,
    user: { login: 'maintainer' },
    created_at: '2026-07-01T10:00:00Z',
    body: 'Can you share delivery IDs? An in-memory lock will not survive a crash.',
    html_url: 'https://github.com/o/r/issues/7#issuecomment-51',
  },
  {
    id: 52,
    user: { login: 'reporter' },
    created_at: '2026-07-01T11:00:00Z',
    // Hostile link: must be dropped, the comment itself kept.
    body: 'IDs attached.',
    html_url: 'javascript:alert(1)',
  },
  {
    id: 53,
    user: { login: 'netlify[bot]' },
    created_at: '2026-07-01T12:00:00Z',
    // Bot scaffolding: HTML tags and table rows must flatten to readable text;
    // the autolink must survive tag stripping.
    body: '<span aria-hidden="true">✅</span> Deploy Preview ready!\n| Name | Link |\n|--|--|\n| preview | x |\nSee <https://github.com/o/r/pull/9> for details.',
    html_url: 'https://github.com/o/r/issues/7#issuecomment-53',
  },
]

const TIMELINE = [
  {
    event: 'cross-referenced',
    actor: { login: 'fixer' },
    created_at: '2026-07-03T09:00:00Z',
    source: {
      type: 'issue',
      issue: {
        number: 9,
        title: 'Persist idempotency keys for webhook deliveries',
        state: 'closed',
        html_url: 'https://github.com/o/r/pull/9',
        pull_request: { merged_at: '2026-07-05T11:00:00Z' },
      },
    },
  },
  // The same PR referenced again: must dedupe, not duplicate.
  {
    event: 'cross-referenced',
    actor: { login: 'fixer' },
    created_at: '2026-07-04T09:00:00Z',
    source: {
      type: 'issue',
      issue: {
        number: 9,
        title: 'Persist idempotency keys for webhook deliveries',
        state: 'closed',
        html_url: 'https://github.com/o/r/pull/9',
        pull_request: { merged_at: '2026-07-05T11:00:00Z' },
      },
    },
  },
  // A cross-referenced ISSUE (no pull_request key): not a linked PR.
  {
    event: 'cross-referenced',
    actor: { login: 'someone' },
    created_at: '2026-07-04T10:00:00Z',
    source: {
      type: 'issue',
      issue: { number: 11, title: 'Related issue', state: 'open', html_url: 'https://github.com/o/r/issues/11' },
    },
  },
  { event: 'closed', actor: { login: 'maintainer' }, created_at: '2026-07-05T12:00:00Z' },
]

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function mockGitHub({ timelineForever = false, issueBody = ISSUE }: { timelineForever?: boolean; issueBody?: unknown } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/issues/7/comments')) return json(COMMENTS)
    if (url.includes('/issues/7/timeline')) {
      const headers: Record<string, string> = {}
      if (timelineForever) {
        const next = new URL(url)
        next.searchParams.set('page', String(Number(next.searchParams.get('page') ?? '1') + 1))
        headers.link = `<${next}>; rel="next"`
      }
      return json(TIMELINE, headers)
    }
    if (url.endsWith('/repos/o/r/issues/7')) return json(issueBody)
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => rmSync(CACHE_DIR, { recursive: true, force: true }))
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(CACHE_DIR, { recursive: true, force: true })
})

describe('importIssue', () => {
  it('builds an issue story with opened, comments, linked PR, and close reason', async () => {
    mockGitHub()
    const story = await importIssue(REF)

    expect(story.title).toBe('Duplicate webhook deliveries under retries')
    expect(story.state).toBe('closed')
    expect(story.stateReason).toBe('completed')
    expect(story.author).toBe('reporter')
    expect(story.commentCount).toBe(2)
    expect(story.labels).toEqual(['bug', 'area: webhooks', 'plain-string-label'])
    expect(story.truncated).toBe(false)

    // One linked PR, deduped, with merged state derived from merged_at.
    expect(story.linkedPrs).toEqual([
      {
        number: 9,
        title: 'Persist idempotency keys for webhook deliveries',
        url: 'https://github.com/o/r/pull/9',
        state: 'merged',
      },
    ])

    const kinds = story.events.map((e) => e.kind)
    expect(kinds[0]).toBe('issue_opened')
    expect(kinds[kinds.length - 1]).toBe('closed')
    expect(kinds.filter((k) => k === 'cross_referenced')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'comment')).toHaveLength(3)

    const closed = story.events[story.events.length - 1]
    expect(closed.title).toBe('closed this issue as completed')
    expect(closed.actor).toBe('maintainer')

    // The javascript: comment link was dropped; the comment survived.
    const hostile = story.events.find((e) => e.id === 'comment-52')
    expect(hostile).toBeDefined()
    expect(hostile?.url).toBeUndefined()

    // Bot scaffolding flattens: no HTML tags, no table pipes — but the
    // autolink URL text survives tag stripping.
    const bot = story.events.find((e) => e.id === 'comment-53')
    expect(bot?.detail).not.toMatch(/<span|\|/)
    expect(bot?.detail).toContain('Deploy Preview ready!')
    expect(bot?.detail).toContain('https://github.com/o/r/pull/9')
  })

  it('routes a PR-numbered issue URL to the PR story instead of faking an issue', async () => {
    mockGitHub({
      issueBody: { ...ISSUE, pull_request: { url: 'https://api.github.com/repos/o/r/pulls/7' } },
    })
    const err = await importIssue(REF).catch((e) => e)
    expect(err).toBeInstanceOf(GitHubImportError)
    expect((err as GitHubImportError).code).toBe('is_pr')
  })

  it('marks the story truncated when the timeline pages past the cap', async () => {
    mockGitHub({ timelineForever: true })
    const story = await importIssue(REF)
    expect(story.truncated).toBe(true)
  })

  it('serves the cache on the second import instead of refetching', async () => {
    const fetchMock = mockGitHub()
    await importIssue(REF)
    const callsAfterFirst = fetchMock.mock.calls.length
    const again = await importIssue(REF)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
    expect(again.title).toBe('Duplicate webhook deliveries under retries')
  })

  it('rejects a pr ref', async () => {
    await expect(importIssue({ ...REF, kind: 'pr' })).rejects.toThrow(/importPr/)
  })
})
