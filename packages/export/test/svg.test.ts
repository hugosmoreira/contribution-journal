import { describe, expect, it } from 'vitest'
import type { PrStory } from '@journal/domain'
import type { StoryGraph } from '@journal/visualizations/graph'
import { timelineToSvg, toSvg, xmlEscape } from '../src/index'

function graph(overrides: Partial<StoryGraph> = {}): StoryGraph {
  return {
    kind: 'problem_solution',
    nodes: [
      {
        id: 'a',
        kind: 'symptom',
        label: 'Retries were racing the scheduler tick',
        provenance: 'ai',
        confirmed: false,
        uncertain: false,
        evidence: [{ label: 'PR body', url: 'https://github.com/o/r/pull/1' }],
        position: { x: 0, y: 0 },
      },
      {
        id: 'b',
        kind: 'fix',
        label: 'Guard the retry window',
        provenance: 'user',
        confirmed: true,
        uncertain: false,
        evidence: [],
        position: { x: 320, y: 10 },
      },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
    ...overrides,
  }
}

const story: PrStory = {
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
      id: 'ev1',
      kind: 'pr_opened',
      actor: 'hugo',
      timestamp: '2026-07-01T10:00:00Z',
      title: 'opened this pull request',
      url: 'https://github.com/o/r/pull/1',
    },
    {
      id: 'ev2',
      kind: 'merged',
      actor: 'reviewer',
      timestamp: '2026-07-02T10:00:00Z',
      title: 'merged this pull request',
    },
  ],
}

describe('toSvg', () => {
  it('produces a standalone svg with both nodes, the edge, and an arrow marker', () => {
    const svg = toSvg(graph())
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('viewBox=')
    expect(svg).toContain('Retries were racing')
    expect(svg).toContain('Guard the retry window')
    expect(svg).toContain('marker-end="url(#arrow)"')
    expect(svg).toContain('<marker id="arrow"')
    // Self-contained: no external fetches of any kind.
    expect(svg).not.toMatch(/(?:src|xlink:href)\s*=/)
    expect(svg).not.toContain('http-equiv')
  })

  it('escapes hostile labels — script tags and attribute breakouts stay inert (DoD 14)', () => {
    const hostile = graph()
    hostile.nodes[0].label = '<script>alert("pwn")</script> & "quote\'break'
    const svg = toSvg(hostile)
    expect(svg).not.toContain('<script')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('&amp;')
    expect(svg).not.toMatch(/label[^<]*"quote/)
  })

  it('drops evidence links that are not github.com, keeps ones that are', () => {
    const g = graph()
    g.nodes[0].evidence = [{ label: 'x', url: 'javascript:alert(1)' as string }]
    const svg = toSvg(g)
    expect(svg).not.toContain('javascript:')
    expect(svg).not.toContain('<a href')

    const ok = toSvg(graph())
    expect(ok).toContain('<a href="https://github.com/o/r/pull/1"')
  })

  it('lays out nodes missing positions instead of stacking them at the origin', () => {
    const g = graph()
    delete g.nodes[0].position
    delete g.nodes[1].position
    const svg = toSvg(g)
    const xs = [...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="230"/g)].map((m) => m[1])
    expect(xs.length).toBe(2)
    expect(new Set(xs).size).toBe(2)
  })

  it('marks unconfirmed drafts dashed and confirmed nodes solid', () => {
    const svg = toSvg(graph())
    const dashed = [...svg.matchAll(/stroke-dasharray/g)]
    expect(dashed.length).toBe(1)
    expect(svg).toContain('· DRAFT')
  })

  it('wraps long labels across lines and truncates at the line cap', () => {
    const g = graph()
    g.nodes[0].label = 'word '.repeat(120).trim()
    const svg = toSvg(g)
    const lines = [...svg.matchAll(/font-size="12\.5"/g)]
    expect(lines.length).toBeGreaterThan(2)
    expect(lines.length).toBeLessThanOrEqual(8 + 1) // node A capped at 8 + node B's single line
    expect(svg).toContain('…')
  })
})

describe('timelineToSvg', () => {
  it('renders a dot and row per event with escaped text', () => {
    const svg = timelineToSvg({
      ...story,
      events: [
        ...story.events,
        {
          id: 'ev3',
          kind: 'comment',
          actor: 'x',
          timestamp: '2026-07-01T12:00:00Z',
          title: '<img src=x onerror=alert(1)>',
        },
      ],
    })
    expect(svg.startsWith('<svg xmlns=')).toBe(true)
    expect([...svg.matchAll(/<circle /g)].length).toBe(3)
    expect(svg).not.toContain('<img')
    expect(svg).toContain('&lt;img')
    expect(svg).toContain('Fix retry race in scheduler')
    expect(svg).toContain('2026-07-01 10:00')
  })

  it('stays deterministic — identical input, identical output', () => {
    expect(timelineToSvg(story)).toBe(timelineToSvg(story))
  })
})

describe('xmlEscape', () => {
  it('escapes the five xml metacharacters', () => {
    expect(xmlEscape(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})
