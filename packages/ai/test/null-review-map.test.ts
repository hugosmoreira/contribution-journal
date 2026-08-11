import { describe, expect, it } from 'vitest'
import { PrStorySchema } from '@journal/domain'
import { StoryGraphSchema } from '@journal/visualizations/graph'
import { NullAssistant } from '../src/index'

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

describe('NullAssistant.draftReviewEvolutionMap', () => {
  it('returns an empty graph when there is no review feedback', async () => {
    const story = PrStorySchema.parse({ ...base, events: [] })
    const graph = await new NullAssistant().draftReviewEvolutionMap(story)
    expect(graph.kind).toBe('review_evolution')
    expect(graph.nodes).toHaveLength(0)
  })

  it('builds a feedback → reading → change → lesson chain per review thread', async () => {
    const story = PrStorySchema.parse({
      ...base,
      events: [
        {
          id: 'review-1',
          kind: 'review_changes',
          actor: 'reviewer',
          timestamp: '2026-07-01T15:00:00Z',
          title: 'requested changes',
          detail: 'The guard needs a test.',
          url: 'https://github.com/o/r/pull/1#review-1',
        },
        {
          id: 'commit-b',
          kind: 'commit',
          actor: 'hugo',
          timestamp: '2026-07-01T18:00:00Z',
          title: 'add regression test',
          url: 'https://github.com/o/r/commit/b',
        },
      ],
    })
    const graph = await new NullAssistant().draftReviewEvolutionMap(story)
    expect(() => StoryGraphSchema.parse(graph)).not.toThrow()
    // Full §3.3c chain: feedback → interpretation → change → evidence-after → lesson.
    expect(graph.nodes.map((n) => n.kind)).toEqual([
      'feedback',
      'interpretation',
      'change',
      'validation',
      'lesson',
    ])
    expect(graph.nodes[0].label).toBe('The guard needs a test.')
    // The commit that landed after the feedback is linked as evidence of the change.
    expect(graph.nodes[2].evidence[0]?.url).toContain('/commit/')
    expect(graph.edges).toHaveLength(4)
    // Nothing invented: unanswerable stages are questions for the author.
    expect(graph.nodes[1].uncertain).toBe(true)
    // No approval in this fixture, so evidence-after is an open question.
    expect(graph.nodes[3].uncertain).toBe(true)
    expect(graph.nodes[4].uncertain).toBe(true)
  })
})
