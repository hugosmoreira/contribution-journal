// Seeds the import cache with a deterministic fixture PR (o/r #1) so the app
// and e2e suite can run without touching the GitHub API.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const story = {
  ref: { owner: 'o', repo: 'r', number: 1, kind: 'pr' },
  orgId: null,
  title: 'Fix retry race in scheduler',
  state: 'merged',
  author: 'hugo',
  createdAt: '2026-07-01T10:00:00Z',
  mergedAt: '2026-07-02T10:00:00Z',
  closedAt: '2026-07-02T10:00:00Z',
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  commitCount: 2,
  headSha: 'abc1234',
  baseBranch: 'main',
  headBranch: 'fix/retry',
  url: 'https://github.com/o/r/pull/1',
  truncated: false,
  events: [
    { id: 'pr-opened-1', kind: 'pr_opened', actor: 'hugo', timestamp: '2026-07-01T10:00:00Z', title: 'opened this pull request', detail: 'Retries were racing the scheduler.', url: 'https://github.com/o/r/pull/1' },
    { id: 'commit-a', kind: 'commit', actor: 'hugo', timestamp: '2026-07-01T11:00:00Z', title: 'guard the retry window', url: 'https://github.com/o/r/commit/a' },
    { id: 'review-1', kind: 'review_changes', actor: 'reviewer', timestamp: '2026-07-01T15:00:00Z', title: 'requested changes', detail: 'The guard needs a test.', url: 'https://github.com/o/r/pull/1#review-1' },
    { id: 'commit-b', kind: 'commit', actor: 'hugo', timestamp: '2026-07-01T18:00:00Z', title: 'add regression test for the retry window', url: 'https://github.com/o/r/commit/b' },
    { id: 'review-2', kind: 'review_approved', actor: 'reviewer', timestamp: '2026-07-02T09:00:00Z', title: 'approved these changes', url: 'https://github.com/o/r/pull/1#review-2' },
    { id: 'merged-1', kind: 'merged', actor: 'reviewer', timestamp: '2026-07-02T10:00:00Z', title: 'merged this pull request', url: 'https://github.com/o/r/pull/1' },
  ],
}

const dir = join(root, 'apps', 'web', '.cache', 'imports')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'o!r!pr-1.json'), JSON.stringify({ fetchedAt: Date.now(), story }))
console.log('seeded fixture story o/r#1 into apps/web/.cache/imports')

// Clear any published row left behind by an aborted e2e run — a stale row
// (whose owner token lives in a dead browser context) would wedge the suite.
try {
  const { default: postgres } = await import('postgres')
  const url = process.env.DATABASE_URL ?? 'postgres://journal:journal_dev@localhost:5544/journal'
  const sql = postgres(url, { max: 1, connect_timeout: 3 })
  await sql`delete from contributions where owner = 'o' and repo = 'r' and number = '1'`
  await sql.end()
  console.log('cleared any stale published row for o/r#1')
} catch {
  console.log('(skipped published-row cleanup — database not reachable)')
}
