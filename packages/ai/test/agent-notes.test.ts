import { describe, expect, it } from 'vitest'
import { PrStorySchema, type PrStory } from '@journal/domain'
import { NullAssistant, normalizeAgentNotes, MAX_AGENT_NOTES } from '../src/index'
import { buildAgentNotesBlock, postProcessDraft, type Draft } from '../src/anthropic'

// Agent capture lets the coding agent report what GitHub cannot show. The
// rule those notes must never break: a claim with no public artifact behind
// it may not end up looking like evidence.

const story: PrStory = PrStorySchema.parse({
  ref: { owner: 'o', repo: 'r', number: 1, kind: 'pr' },
  orgId: null,
  title: 'Fix retry race',
  state: 'merged',
  author: 'hugo',
  createdAt: '2026-07-01T10:00:00Z',
  mergedAt: '2026-07-02T10:00:00Z',
  closedAt: '2026-07-02T10:00:00Z',
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  commitCount: 1,
  headSha: 'abc1234',
  baseBranch: 'main',
  headBranch: 'fix/retry',
  url: 'https://github.com/o/r/pull/1',
  truncated: false,
  events: [
    {
      id: 'commit-a',
      kind: 'commit',
      actor: 'hugo',
      timestamp: '2026-07-01T11:00:00Z',
      title: 'guard the retry window',
      url: 'https://github.com/o/r/commit/a',
    },
  ],
})

const notes = normalizeAgentNotes(['Tried a mutex first; it deadlocked under the scheduler tick.'])

function draft(nodes: Draft['nodes']): Draft {
  return { nodes, edges: [] }
}

describe('normalizeAgentNotes', () => {
  it('assigns server-side ids — the agent never chooses them', () => {
    expect(normalizeAgentNotes(['a', 'b'])).toEqual([
      { id: 'agent-note-1', text: 'a' },
      { id: 'agent-note-2', text: 'b' },
    ])
  })

  it('accepts a bare string, drops blanks, and caps count and length', () => {
    expect(normalizeAgentNotes('solo')).toEqual([{ id: 'agent-note-1', text: 'solo' }])
    expect(normalizeAgentNotes(['', '   ', 'kept'])).toHaveLength(1)
    expect(normalizeAgentNotes(Array.from({ length: 50 }, () => 'x'))).toHaveLength(MAX_AGENT_NOTES)
    expect(normalizeAgentNotes(['y'.repeat(9000)])[0].text.length).toBeLessThanOrEqual(1500)
  })

  it('ignores non-string junk instead of throwing', () => {
    expect(normalizeAgentNotes([1, null, { a: 1 }, 'ok'])).toEqual([{ id: 'agent-note-1', text: 'ok' }])
    expect(normalizeAgentNotes(undefined)).toEqual([])
  })
})

describe('agent notes in the prompt', () => {
  it('sits in its own block so the model cannot confuse it with the record', () => {
    const block = buildAgentNotesBlock(notes)
    expect(block).toContain('<agent_notes>')
    expect(block).toContain('[agent-note-1]')
    expect(block).toContain('deadlocked')
    expect(buildAgentNotesBlock([])).toBe('')
  })
})

describe('postProcessDraft with agent notes', () => {
  it('marks a note-cited node as agent provenance and gives it NO evidence link', () => {
    const graph = postProcessDraft(
      'problem_solution',
      draft([
        {
          id: 'h1',
          kind: 'hypothesis',
          label: 'A mutex was tried first and deadlocked',
          uncertain: false,
          evidence_event_ids: ['agent-note-1'],
        },
      ]),
      story,
      notes,
    )
    expect(graph.nodes[0].provenance).toBe('agent')
    expect(graph.nodes[0].evidence).toEqual([])
  })

  it('never lets a note become a link — notes carry no URL at any point', () => {
    const graph = postProcessDraft(
      'problem_solution',
      draft([
        { id: 'h1', kind: 'hypothesis', label: 'x', uncertain: false, evidence_event_ids: ['agent-note-1'] },
      ]),
      story,
      normalizeAgentNotes(['see https://evil.example/payload for the fix']),
    )
    expect(JSON.stringify(graph)).not.toContain('evil.example')
    expect(graph.nodes[0].evidence).toHaveLength(0)
  })

  it('keeps real evidence winning: a node grounded in the record stays ai', () => {
    const graph = postProcessDraft(
      'problem_solution',
      draft([
        {
          id: 'f1',
          kind: 'fix',
          label: 'guard the retry window',
          uncertain: false,
          evidence_event_ids: ['commit-a', 'agent-note-1'],
        },
      ]),
      story,
      notes,
    )
    expect(graph.nodes[0].provenance).toBe('ai')
    expect(graph.nodes[0].evidence).toHaveLength(1)
  })

  it('drops a fabricated note id — only server-issued ids resolve', () => {
    const graph = postProcessDraft(
      'problem_solution',
      draft([
        { id: 'h1', kind: 'hypothesis', label: 'x', uncertain: false, evidence_event_ids: ['agent-note-99'] },
      ]),
      story,
      notes,
    )
    expect(graph.nodes[0].provenance).toBe('ai')
    expect(graph.nodes[0].evidence).toHaveLength(0)
    // No grounding at all, so it must still read as uncertain.
    expect(graph.nodes[0].uncertain).toBe(true)
  })

  it('leaves evidence-free, note-free nodes uncertain as before', () => {
    const graph = postProcessDraft(
      'problem_solution',
      draft([{ id: 'r1', kind: 'root_cause', label: 'What caused it?', uncertain: false, evidence_event_ids: [] }]),
      story,
      notes,
    )
    expect(graph.nodes[0].uncertain).toBe(true)
    expect(graph.nodes[0].provenance).toBe('ai')
  })
})

describe('NullAssistant with agent notes (no API key)', () => {
  it('still surfaces the agent account rather than dropping it', async () => {
    const graph = await new NullAssistant().draftProblemSolutionMap(story, notes)
    const agentNodes = graph.nodes.filter((n) => n.provenance === 'agent')
    expect(agentNodes).toHaveLength(1)
    expect(agentNodes[0].label).toContain('deadlocked')
    expect(agentNodes[0].evidence).toEqual([])
    // And it is connected into the graph, not orphaned.
    expect(graph.edges.some((e) => e.target === agentNodes[0].id)).toBe(true)
  })

  it('is unchanged when there are no notes', async () => {
    const graph = await new NullAssistant().draftProblemSolutionMap(story)
    expect(graph.nodes.every((n) => n.provenance === 'skeleton')).toBe(true)
  })
})
