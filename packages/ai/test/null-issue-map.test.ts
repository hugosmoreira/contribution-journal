import { describe, expect, it } from 'vitest'
import type { IssueStory } from '@journal/domain'
import { NullAssistant } from '../src/index'

function issueStory(overrides: Partial<IssueStory> = {}): IssueStory {
  return {
    ref: { owner: 'o', repo: 'r', number: 7, kind: 'issue' },
    orgId: null,
    title: 'Duplicate webhook deliveries under retries',
    state: 'closed',
    stateReason: 'completed',
    author: 'reporter',
    createdAt: '2026-07-01T09:00:00Z',
    closedAt: '2026-07-05T12:00:00Z',
    commentCount: 2,
    labels: ['bug'],
    linkedPrs: [
      {
        number: 9,
        title: 'Persist idempotency keys',
        url: 'https://github.com/o/r/pull/9',
        state: 'merged',
      },
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
        detail: 'Customers receive the same webhook twice.',
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
        id: 'xref-pr-9',
        kind: 'cross_referenced',
        actor: 'fixer',
        timestamp: '2026-07-03T09:00:00Z',
        title: 'linked pull request #9: Persist idempotency keys',
        url: 'https://github.com/o/r/pull/9',
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
    ...overrides,
  }
}

describe('NullAssistant.draftIssueExplorationMap', () => {
  it('drafts a deterministic skeleton chain from the evidence', async () => {
    const graph = await new NullAssistant().draftIssueExplorationMap(issueStory())

    expect(graph.kind).toBe('issue_exploration')
    expect(graph.nodes.map((n) => n.kind)).toEqual(['symptom', 'hypothesis', 'fix', 'outcome'])
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
    expect(graph.nodes.every((n) => !n.confirmed)).toBe(true)

    const fix = graph.nodes.find((n) => n.kind === 'fix')
    expect(fix?.label).toContain('#9')
    expect(fix?.uncertain).toBe(false)
    expect(fix?.evidence[0]?.url).toBe('https://github.com/o/r/pull/9')

    const outcome = graph.nodes.find((n) => n.kind === 'outcome')
    expect(outcome?.label).toBe('Closed as completed')

    // The discussion node cites the maintainer reply, not the reporter's own text.
    const hypothesis = graph.nodes.find((n) => n.kind === 'hypothesis')
    expect(hypothesis?.uncertain).toBe(true)
    expect(hypothesis?.evidence[0]?.url).toContain('issuecomment-51')
  })

  it('asks questions instead of inventing facts when the issue is bare', async () => {
    const graph = await new NullAssistant().draftIssueExplorationMap(
      issueStory({
        state: 'open',
        stateReason: null,
        closedAt: null,
        linkedPrs: [],
        events: [
          {
            id: 'issue-opened-1',
            kind: 'issue_opened',
            actor: 'reporter',
            timestamp: '2026-07-01T09:00:00Z',
            title: 'opened this issue',
            url: 'https://github.com/o/r/issues/7',
          },
        ],
      }),
    )

    const labels = graph.nodes.map((n) => n.label)
    expect(labels).toContain('What approaches did the discussion propose?')
    expect(labels).toContain('What change addresses this issue?')
    expect(labels).toContain('Still open')
    const fix = graph.nodes.find((n) => n.kind === 'fix')
    expect(fix?.uncertain).toBe(true)
  })

  it('attaches agent notes as their own unverified nodes', async () => {
    const graph = await new NullAssistant().draftIssueExplorationMap(issueStory(), [
      { id: 'agent-note-1', text: 'Tried a worker mutex first; it failed under two replicas.' },
    ])
    const agent = graph.nodes.find((n) => n.provenance === 'agent')
    expect(agent?.label).toContain('worker mutex')
    expect(agent?.evidence).toEqual([])
  })
})
