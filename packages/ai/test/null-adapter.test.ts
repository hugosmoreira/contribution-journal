import { describe, expect, it } from 'vitest'
import { PrStorySchema } from '@journal/domain'
import { StoryGraphSchema } from '@journal/visualizations/graph'
import { NullAssistant } from '../src/index'

const story = PrStorySchema.parse({
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
    {
      id: 'pr-opened-1',
      kind: 'pr_opened',
      actor: 'hugo',
      timestamp: '2026-07-01T10:00:00Z',
      title: 'opened this pull request',
      url: 'https://github.com/o/r/pull/1',
    },
    {
      id: 'commit-a',
      kind: 'commit',
      actor: 'hugo',
      timestamp: '2026-07-01T11:00:00Z',
      title: 'guard the retry window',
      url: 'https://github.com/o/r/commit/a',
    },
    {
      id: 'review-1',
      kind: 'review_approved',
      actor: 'reviewer',
      timestamp: '2026-07-02T09:00:00Z',
      title: 'approved these changes',
      url: 'https://github.com/o/r/pull/1#review-1',
    },
    {
      id: 'merged-1',
      kind: 'merged',
      actor: 'reviewer',
      timestamp: '2026-07-02T10:00:00Z',
      title: 'merged this pull request',
      url: 'https://github.com/o/r/pull/1',
    },
  ],
})

describe('NullAssistant.draftProblemSolutionMap', () => {
  it('drafts a valid skeleton graph from evidence alone', async () => {
    const graph = await new NullAssistant().draftProblemSolutionMap(story)

    // Round-trips the schema (edges reference real nodes, evidence links are GitHub).
    expect(() => StoryGraphSchema.parse(graph)).not.toThrow()
    expect(graph.kind).toBe('problem_solution')
    expect(graph.nodes.map((n) => n.kind)).toEqual([
      'symptom',
      'hypothesis',
      'root_cause',
      'fix',
      'validation',
      'outcome',
    ])

    // Nothing is presented as confirmed and every label is non-empty (SPEC §3.5).
    for (const node of graph.nodes) {
      expect(node.confirmed).toBe(false)
      expect(node.provenance).toBe('skeleton')
      expect(node.label.length).toBeGreaterThan(0)
    }

    // Evidence flows through: symptom links the PR, fix links the commit,
    // validation links the approval, outcome links the merge.
    expect(graph.nodes.find((n) => n.id === 'fix')?.evidence[0]?.url).toContain('/commit/')
    expect(graph.nodes.find((n) => n.id === 'validation')?.label).toBe('Approved by 1 reviewer')
    expect(graph.nodes.find((n) => n.id === 'outcome')?.label).toBe('Merged')
  })

  it('asks questions instead of inventing facts when evidence is missing', async () => {
    const bare = { ...story, state: 'open' as const, mergedAt: null, closedAt: null, events: [] }
    const graph = await new NullAssistant().draftProblemSolutionMap(bare)
    const rootCause = graph.nodes.find((n) => n.id === 'root_cause')
    expect(rootCause?.label).toContain('?')
    expect(rootCause?.uncertain).toBe(true)
    expect(graph.nodes.find((n) => n.id === 'outcome')?.label).toBe('Still open')
  })
})
