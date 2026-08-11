import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { importPr } from '../src/fetch'

// Own cache dir: issue-import.test.ts wipes its cache in a parallel worker,
// and two files rm-ing the same tree races (ENOTEMPTY on CI's Linux, EPERM
// on Windows). vi.hoisted runs before ../src/fetch loads cache.ts, which
// freezes the cache path at module scope.
const CACHE_DIR = vi.hoisted(() => {
  const dir = `.cache-test-import-${process.pid}`
  process.env.JOURNAL_CACHE_DIR = dir
  return dir
})

const REF = { owner: 'o', repo: 'r', number: 1, kind: 'pr' as const }

const PR = {
  id: 900,
  user: { login: 'hugo', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
  html_url: 'https://github.com/o/r/pull/1',
  title: 'Fix the flaky retry logic',
  body: 'Retries were racing the scheduler.',
  state: 'closed',
  created_at: '2026-07-01T10:00:00Z',
  merged_at: null,
  closed_at: '2026-07-02T10:00:00Z',
  merged_by: null,
  additions: 10,
  deletions: 2,
  changed_files: 3,
  commits: 150,
  head: { sha: 'a'.repeat(40), ref: 'fix/retry' },
  base: { ref: 'main' },
}

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function mockGitHub(commitPages: { paginateForever?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/pulls/1/commits')) {
        const page = Number(new URL(url).searchParams.get('page') ?? '1')
        const items = [
          {
            sha: `sha${page}${'0'.repeat(37)}`,
            author: null,
            // Git author names are free text — this one must be cleaned, not trusted.
            commit: { author: { name: `Author ${page}`, date: `2026-07-01T1${Math.min(page, 8)}:00:00Z` }, message: `commit ${page}` },
            html_url: page === 1 ? 'javascript:alert(1)' : `https://github.com/o/r/commit/${page}`,
          },
        ]
        if (page === 2) {
          // A hand-crafted absurd commit date: must be skipped, not crash the page.
          items.push({
            sha: `bad${'0'.repeat(37)}`,
            author: null,
            commit: { author: { name: 'Time Traveler', date: '999999-01-01T00:00:00Z' }, message: 'from the far future' },
            html_url: 'https://github.com/o/r/commit/bad',
          })
        }
        const headers: Record<string, string> = {}
        if (commitPages.paginateForever || page < 2) {
          const next = new URL(url)
          next.searchParams.set('page', String(page + 1))
          headers.link = `<${next}>; rel="next"`
        }
        return json(items, headers)
      }
      if (url.includes('/pulls/1/reviews') || url.includes('/issues/1/comments') || url.includes('/pulls/1/comments')) {
        return json([])
      }
      if (url.endsWith('/repos/o/r/pulls/1')) {
        return json(PR)
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

beforeEach(() => rmSync(CACHE_DIR, { recursive: true, force: true }))
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(CACHE_DIR, { recursive: true, force: true })
})

describe('importPr', () => {
  it('builds a complete story from a paginated import', async () => {
    mockGitHub()
    const story = await importPr(REF)

    // commitCount comes from the PR object, never the fetched page length.
    expect(story.commitCount).toBe(150)
    expect(story.truncated).toBe(false)
    expect(story.state).toBe('closed')

    // 1 opened + 2 valid commits + 1 closed; the far-future commit is dropped.
    expect(story.events).toHaveLength(4)
    expect(story.events.some((e) => e.title.includes('far future'))).toBe(false)

    // javascript: URLs never survive import.
    const commit1 = story.events.find((e) => e.id.startsWith('commit-sha1'))
    expect(commit1?.url).toBeUndefined()
    const commit2 = story.events.find((e) => e.id.startsWith('commit-sha2'))
    expect(commit2?.url).toBe('https://github.com/o/r/commit/2')

    // Closed-unmerged PRs have no recorded closer: no actor, honest title.
    const closed = story.events.at(-1)
    expect(closed?.kind).toBe('closed')
    expect(closed?.actor).toBe('')
  })

  it('marks the story truncated when pagination hits the page cap', async () => {
    mockGitHub({ paginateForever: true })
    const story = await importPr(REF)
    expect(story.truncated).toBe(true)
  })

  it('serves the cached story on re-import without network calls', async () => {
    mockGitHub()
    await importPr(REF)
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.length
    const again = await importPr(REF)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
    expect(again.title).toBe('Fix the flaky retry logic')
  })
})
