import { describe, expect, it } from 'vitest'
import { PrStorySchema, type PrStory } from '@journal/domain'
import { NullAssistant, feedbackEvents } from '../src/index'

// Regression cover for a bug the dogfood pass found: gating the review
// evolution map on FORMAL review events alone silently produced no map at
// all on projects that review in the plain comment thread (rust-lang/rust,
// python/cpython), which is the product's most differentiated visual.

const base = {
  ref: { owner: 'o', repo: 'r', number: 1, kind: 'pr' as const },
  orgId: null,
  title: 'Fix retry race',
  state: 'merged' as const,
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
}

function story(events: unknown[]): PrStory {
  return PrStorySchema.parse({ ...base, events })
}

const comment = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  kind: 'comment',
  actor: 'maintainer',
  timestamp: '2026-07-01T12:00:00Z',
  title: 'commented',
  detail: 'Please pull this guard into its own function.',
  url: 'https://github.com/o/r/pull/1#issuecomment-1',
  ...over,
})

describe('feedbackEvents', () => {
  it('counts a maintainer comment as feedback — not every project uses formal reviews', () => {
    expect(feedbackEvents(story([comment()]))).toHaveLength(1)
  })

  it("ignores the author's own comments — that is narration, not review", () => {
    expect(feedbackEvents(story([comment({ actor: 'hugo' })]))).toHaveLength(0)
    // Case-insensitively: GitHub logins are not case-sensitive.
    expect(feedbackEvents(story([comment({ actor: 'HUGO' })]))).toHaveLength(0)
  })

  it('ignores GitHub App bots and bodiless comments', () => {
    expect(feedbackEvents(story([comment({ actor: 'github-actions[bot]' })]))).toHaveLength(0)
    expect(feedbackEvents(story([comment({ detail: undefined })]))).toHaveLength(0)
  })

  it('still counts formal review events', () => {
    const events = [
      { id: 'r1', kind: 'review_changes', actor: 'm', timestamp: '2026-07-01T15:00:00Z', title: 'requested changes' },
      { id: 'r2', kind: 'review_comment', actor: 'm', timestamp: '2026-07-01T16:00:00Z', title: 'commented', detail: 'nit' },
      { id: 'r3', kind: 'review_approved', actor: 'm', timestamp: '2026-07-01T17:00:00Z', title: 'approved' },
    ]
    const found = feedbackEvents(story(events))
    // Approval is an outcome, not feedback to respond to.
    expect(found.map((e) => e.id)).toEqual(['r1', 'r2'])
  })

  it('ignores commits and merges', () => {
    const events = [
      { id: 'x1', kind: 'commit', actor: 'hugo', timestamp: '2026-07-01T11:00:00Z', title: 'wip' },
      { id: 'x2', kind: 'merged', actor: 'm', timestamp: '2026-07-02T10:00:00Z', title: 'merged' },
    ]
    expect(feedbackEvents(story(events))).toHaveLength(0)
  })
})

describe('NullAssistant.draftReviewEvolutionMap with comment-thread review', () => {
  it('builds a map from maintainer comments alone', async () => {
    const graph = await new NullAssistant().draftReviewEvolutionMap(
      story([
        comment(),
        { id: 'commit-1', kind: 'commit', actor: 'hugo', timestamp: '2026-07-01T13:00:00Z', title: 'extract guard', url: 'https://github.com/o/r/commit/a' },
        { id: 'merged-1', kind: 'merged', actor: 'maintainer', timestamp: '2026-07-02T10:00:00Z', title: 'merged this pull request' },
      ]),
    )
    expect(graph.nodes.length).toBeGreaterThan(0)
    const kinds = graph.nodes.map((n) => n.kind)
    expect(kinds).toContain('feedback')
    expect(kinds).toContain('change')
    expect(kinds).toContain('lesson')
    // The commit that followed the comment is linked as the response.
    const change = graph.nodes.find((n) => n.kind === 'change')
    expect(change?.label).toContain('extract guard')
  })

  it('still returns an empty graph when only the author and bots spoke', async () => {
    const graph = await new NullAssistant().draftReviewEvolutionMap(
      story([comment({ actor: 'hugo' }), comment({ id: 'c2', actor: 'netlify[bot]' })]),
    )
    expect(graph.nodes).toHaveLength(0)
  })
})
