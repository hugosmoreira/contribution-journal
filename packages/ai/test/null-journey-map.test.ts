import { describe, expect, it } from 'vitest'
import type { IssueStory, PrStory } from '@journal/domain'
import { NullAssistant } from '../src/index'

const ISSUE: IssueStory = {
  ref: { owner: 'o', repo: 'r', number: 7, kind: 'issue' },
  orgId: null,
  title: 'Duplicate webhook deliveries under retries',
  state: 'closed',
  stateReason: 'completed',
  author: 'reporter',
  createdAt: '2026-07-01T09:00:00Z',
  closedAt: '2026-07-05T12:00:00Z',
  commentCount: 1,
  labels: [],
  linkedPrs: [
    { number: 9, title: 'Persist idempotency keys', url: 'https://github.com/o/r/pull/9', state: 'merged' },
  ],
  url: 'https://github.com/o/r/issues/7',
  truncated: false,
  events: [
    {
      id: 'issue-opened-1',
      kind: 'issue_opened',
      actor: 'reporter',
      timestamp: '2026-07-01T09:00:00Z',
      title: 'opened this issue',
      url: 'https://github.com/o/r/issues/7',
    },
    {
      id: 'comment-51',
      kind: 'comment',
      actor: 'maintainer',
      timestamp: '2026-07-01T10:00:00Z',
      title: 'commented',
      detail: 'An in-memory lock will not survive a crash.',
      url: 'https://github.com/o/r/issues/7#issuecomment-51',
    },
    {
      id: 'issue-closed-1',
      kind: 'closed',
      actor: 'maintainer',
      timestamp: '2026-07-05T12:00:00Z',
      title: 'closed this issue as completed',
      url: 'https://github.com/o/r/issues/7',
    },
  ],
}

const PR: PrStory = {
  ref: { owner: 'o', repo: 'r', number: 9, kind: 'pr' },
  orgId: null,
  title: 'Persist idempotency keys',
  state: 'merged',
  author: 'fixer',
  createdAt: '2026-07-03T09:00:00Z',
  mergedAt: '2026-07-05T11:00:00Z',
  closedAt: '2026-07-05T11:00:00Z',
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  commitCount: 2,
  headSha: 'a'.repeat(40),
  baseBranch: 'main',
  headBranch: 'fix/dedup',
  url: 'https://github.com/o/r/pull/9',
  truncated: false,
  linkedIssueNumbers: [7],
  events: [
    {
      id: 'pr-opened-9',
      kind: 'pr_opened',
      actor: 'fixer',
      timestamp: '2026-07-03T09:00:00Z',
      title: 'opened this pull request',
      url: 'https://github.com/o/r/pull/9',
    },
    {
      id: 'review-1',
      kind: 'review_changes',
      actor: 'maintainer',
      timestamp: '2026-07-04T09:00:00Z',
      title: 'requested changes',
      detail: 'Make the state write and the send share one transaction.',
      url: 'https://github.com/o/r/pull/9#pullrequestreview-1',
    },
    {
      id: 'merged-9',
      kind: 'merged',
      actor: 'maintainer',
      timestamp: '2026-07-05T11:00:00Z',
      title: 'merged this pull request',
      url: 'https://github.com/o/r/pull/9',
    },
  ],
}

describe('NullAssistant.draftJourneyMap', () => {
  it('chains issue → discussion → PR fix → feedback → validation → outcome → lesson', async () => {
    const graph = await new NullAssistant().draftJourneyMap(ISSUE, [PR])

    expect(graph.kind).toBe('journey')
    const kinds = graph.nodes.map((n) => n.kind)
    expect(kinds).toEqual([
      'symptom',
      'hypothesis',
      'fix',
      'feedback',
      'validation',
      'outcome',
      'lesson',
    ])

    const fix = graph.nodes.find((n) => n.kind === 'fix')
    expect(fix?.label).toContain('PR #9')
    const outcome = graph.nodes.find((n) => n.kind === 'outcome')
    expect(outcome?.label).toBe('Issue closed as completed')
    const lesson = graph.nodes.find((n) => n.kind === 'lesson')
    expect(lesson?.uncertain).toBe(true)

    // Every edge chains into a single connected story.
    const ids = new Set(graph.nodes.map((n) => n.id))
    expect(graph.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true)
    expect(graph.edges).toHaveLength(graph.nodes.length - 1)
  })

  it('skips feedback/validation nodes when a PR has neither', async () => {
    const bare: PrStory = { ...PR, events: [PR.events[0]] }
    const graph = await new NullAssistant().draftJourneyMap(ISSUE, [bare])
    const kinds = graph.nodes.map((n) => n.kind)
    expect(kinds).toEqual(['symptom', 'hypothesis', 'fix', 'outcome', 'lesson'])
  })
})
