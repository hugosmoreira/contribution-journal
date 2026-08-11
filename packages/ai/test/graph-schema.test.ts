import { describe, expect, it } from 'vitest'
import { StoryGraphSchema, chainLayout, nodeHeight } from '@journal/visualizations/graph'

const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'hypothesis',
  label: `node ${id}`,
  provenance: 'user',
  confirmed: true,
  uncertain: false,
  evidence: [],
  ...extra,
})

const base = {
  kind: 'problem_solution',
  nodes: [node('a'), node('b')],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
}

describe('StoryGraphSchema', () => {
  it('accepts a valid graph', () => {
    expect(StoryGraphSchema.safeParse(base).success).toBe(true)
  })

  it('rejects dangling edges', () => {
    const g = { ...base, edges: [{ id: 'e1', source: 'a', target: 'missing' }] }
    expect(StoryGraphSchema.safeParse(g).success).toBe(false)
  })

  it('rejects duplicate edge ids', () => {
    const g = {
      ...base,
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e1', source: 'b', target: 'a' },
      ],
    }
    expect(StoryGraphSchema.safeParse(g).success).toBe(false)
  })

  it('caps graph size (DoS guard for the server layout action)', () => {
    const g = {
      kind: 'problem_solution',
      nodes: Array.from({ length: 201 }, (_, i) => node(`n${i}`)),
      edges: [],
    }
    expect(StoryGraphSchema.safeParse(g).success).toBe(false)
    const long = { ...base, nodes: [node('a', { label: 'x'.repeat(2001) }), node('b')] }
    expect(StoryGraphSchema.safeParse(long).success).toBe(false)
  })

  it('rejects non-GitHub evidence urls', () => {
    const g = {
      ...base,
      nodes: [node('a', { evidence: [{ label: 'x', url: 'javascript:alert(1)' }] }), node('b')],
    }
    expect(StoryGraphSchema.safeParse(g).success).toBe(false)
  })
})

describe('chainLayout', () => {
  it('never overlaps stacked nodes, even tall ones', () => {
    const tall = 'a very long label that wraps across many lines '.repeat(8)
    const g = StoryGraphSchema.parse({
      kind: 'problem_solution',
      nodes: [node('root'), node('x', { label: tall }), node('y'), node('z')],
      edges: [
        { id: 'e1', source: 'root', target: 'x' },
        { id: 'e2', source: 'root', target: 'y' },
        { id: 'e3', source: 'root', target: 'z' },
      ],
    })
    const laid = chainLayout(g)
    const depth1 = laid.nodes.filter((n) => n.id !== 'root').sort((a, b) => a.position!.y - b.position!.y)
    for (let i = 1; i < depth1.length; i++) {
      const prev = depth1[i - 1]
      const gap = depth1[i].position!.y - prev.position!.y
      expect(gap).toBeGreaterThanOrEqual(nodeHeight(prev.label, false))
    }
  })
})
