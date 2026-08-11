import { z } from 'zod'
import { isGitHubWebUrl } from '@journal/domain'

export const GraphNodeKindSchema = z.enum([
  // problem → solution map
  'symptom',
  'hypothesis',
  'root_cause',
  'fix',
  'validation',
  'outcome',
  // review evolution map (SPEC_V0.1 §3.3c)
  'feedback',
  'interpretation',
  'change',
  'lesson',
])
export type GraphNodeKind = z.infer<typeof GraphNodeKindSchema>

// Provenance is the product's core honesty rule (SPEC_V0.1 §3.5): drafted
// nodes render visually distinct until the user confirms or edits them, and
// a node with no linked evidence is treated as inferred.
//
// 'agent' is its own class on purpose. A coding agent knows what GitHub
// loses — what it tried, what failed, why it chose an approach — but that
// account has no public artifact behind it. Folding it in with 'ai' would
// let an unverifiable claim inherit the credibility of evidence-grounded
// drafting; it is labelled separately so the reader can tell the difference.
//
// Size caps are load-bearing, not cosmetic: this schema validates
// client-supplied input to the server-side ELK layout action, and elkjs runs
// synchronously on the event loop — an unbounded graph is a CPU DoS.
export const GraphNodeSchema = z.object({
  id: z.string().min(1).max(120),
  kind: GraphNodeKindSchema,
  label: z.string().max(2000),
  provenance: z.enum(['ai', 'agent', 'skeleton', 'user']),
  confirmed: z.boolean(),
  uncertain: z.boolean(),
  evidence: z
    .array(
      z.object({
        label: z.string().max(200),
        url: z
          .string()
          .max(500)
          .refine(isGitHubWebUrl, { message: 'evidence must deep-link to github.com' }),
      }),
    )
    .max(10),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
})
export type GraphNode = z.infer<typeof GraphNodeSchema>

export const GraphEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().max(500).optional(),
})
export type GraphEdge = z.infer<typeof GraphEdgeSchema>

export const NODE_WIDTH = 230

export function nodeHeight(label: string, hasEvidence: boolean): number {
  const lines = Math.max(1, Math.ceil(label.length / 28))
  return 46 + lines * 18 + (hasEvidence ? 22 : 0)
}

export const StoryGraphSchema = z
  .object({
    kind: z.enum(['problem_solution', 'review_evolution', 'issue_exploration', 'journey']),
    nodes: z.array(GraphNodeSchema).max(200),
    edges: z.array(GraphEdgeSchema).max(500),
  })
  .refine(
    (g) => {
      const nodeIds = new Set(g.nodes.map((n) => n.id))
      const edgeIds = new Set(g.edges.map((e) => e.id))
      return (
        nodeIds.size === g.nodes.length &&
        edgeIds.size === g.edges.length &&
        g.edges.every((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      )
    },
    { message: 'node and edge ids must be unique, and edges must connect existing nodes' },
  )
export type StoryGraph = z.infer<typeof StoryGraphSchema>

/**
 * Deterministic elk-free layout: layers nodes by their longest path from a
 * root, left to right. Used as the client-side and error fallback so a map
 * always has sane positions even if ELK is unavailable. Row pitch follows
 * actual node heights so tall nodes never overlap.
 */
export function chainLayout(graph: StoryGraph): StoryGraph {
  const depths = new Map<string, number>()
  const incoming = new Map<string, string[]>()
  for (const e of graph.edges) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source])
  }
  const depthOf = (id: string, seen: Set<string>): number => {
    const known = depths.get(id)
    if (known !== undefined) return known
    if (seen.has(id)) return 0
    seen.add(id)
    const parents = incoming.get(id) ?? []
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => depthOf(p, seen))) + 1
    depths.set(id, d)
    return d
  }
  const nextYAtDepth = new Map<number, number>()
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const d = depthOf(n.id, new Set())
      const y = nextYAtDepth.get(d) ?? (d % 2) * 40
      nextYAtDepth.set(d, y + nodeHeight(n.label, n.evidence.length > 0) + 46)
      return { ...n, position: { x: d * (NODE_WIDTH + 90), y } }
    }),
  }
}
