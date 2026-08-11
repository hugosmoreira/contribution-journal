import { describe, expect, it } from 'vitest'
import { PrStorySchema } from '@journal/domain'
import { StoryGraphSchema } from '@journal/visualizations/graph'
import { escapeMermaidLabel, toMarkdown, toMermaid, toExportJSON } from '../src/index'

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
      id: 'commit-a',
      kind: 'commit',
      actor: 'hugo',
      timestamp: '2026-07-01T11:00:00Z',
      title: 'guard the retry window',
      url: 'https://github.com/o/r/commit/a',
    },
  ],
})

const graph = StoryGraphSchema.parse({
  kind: 'problem_solution',
  nodes: [
    {
      id: 'sym',
      kind: 'symptom',
      label: 'Retries "raced" the `scheduler`\nacross ticks',
      provenance: 'ai',
      confirmed: false,
      uncertain: true,
      evidence: [{ label: 'guard the retry window', url: 'https://github.com/o/r/commit/a' }],
    },
    {
      id: 'fix',
      kind: 'fix',
      label: 'Guard the window',
      provenance: 'user',
      confirmed: true,
      uncertain: false,
      evidence: [],
    },
  ],
  edges: [{ id: 'e1', source: 'sym', target: 'fix' }],
})

describe('escapeMermaidLabel', () => {
  it('neutralizes quotes, backticks, and newlines', () => {
    const out = escapeMermaidLabel('a "quoted" `tick`\nnewline')
    expect(out).not.toContain('"')
    expect(out).not.toContain('`')
    expect(out).not.toContain('\n')
  })
})

describe('toMermaid', () => {
  it('renders nodes with kind classes and edges', () => {
    const mmd = toMermaid(graph)
    expect(mmd).toContain('flowchart LR')
    expect(mmd).toContain(':::symptom')
    expect(mmd).toContain('sym --> fix')
    // The uncertain node is visibly marked.
    expect(mmd).toContain('"? ')
    // Hostile label characters cannot break out of the node statement.
    expect(mmd).not.toMatch(/Retries "/)
  })
})

describe('toMarkdown', () => {
  it('produces a complete document with maps, provenance flags, and timeline', () => {
    const md = toMarkdown(story, { problemSolution: graph }, new Date('2026-07-31T00:00:00Z'))
    expect(md).toContain('# Fix retry race in scheduler')
    expect(md).toContain('```mermaid')
    expect(md).toContain('AI draft')
    expect(md).toContain('inferred — no evidence')
    expect(md).toContain('[evidence](https://github.com/o/r/commit/a)')
    expect(md).toContain('## Timeline')
    expect(md).toContain('2026-07-31')
  })

  it('omits the review section when there is no review map', () => {
    const md = toMarkdown(story, { problemSolution: graph })
    expect(md).not.toContain('## Review evolution')
  })
})

describe('toExportJSON', () => {
  it('round-trips through the schemas', () => {
    const json = JSON.parse(toExportJSON(story, { problemSolution: graph }))
    expect(json.format).toBe('contribution-journal/v1')
    expect(() => PrStorySchema.parse(json.story)).not.toThrow()
    expect(() => StoryGraphSchema.parse(json.maps.problemSolution)).not.toThrow()
  })
})
