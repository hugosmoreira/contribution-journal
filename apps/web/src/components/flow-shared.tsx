'use client'

import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react'
import type { GraphNodeKind, StoryGraph } from '@journal/visualizations/graph'

// Below this zoom the 13px node labels drop under ~10 physical pixels and the
// map stops being readable. Both the editor and the published page refuse to
// open below it.
export const LEGIBLE_ZOOM = 0.78

export type EvidenceLink = { label: string; url: string }

export type StoryNodeData = {
  label: string
  kind: GraphNodeKind
  provenance: 'ai' | 'agent' | 'skeleton' | 'user'
  confirmed: boolean
  uncertain: boolean
  evidence: EvidenceLink[]
  [key: string]: unknown
}

export const KIND_LABELS: Record<GraphNodeKind, string> = {
  symptom: 'problem',
  hypothesis: 'approach',
  root_cause: 'root cause',
  fix: 'fix',
  validation: 'validation',
  outcome: 'outcome',
  feedback: 'feedback',
  interpretation: 'your reading',
  change: 'change',
  lesson: 'lesson',
}

export const KINDS: GraphNodeKind[] = [
  'symptom',
  'hypothesis',
  'root_cause',
  'fix',
  'validation',
  'outcome',
  'feedback',
  'interpretation',
  'change',
  'lesson',
]

export function StoryNode({ data, selected }: NodeProps) {
  const d = data as StoryNodeData
  return (
    <div
      className={[
        'story-node',
        `kind-${d.kind}`,
        `prov-${d.provenance}`,
        d.confirmed ? 'is-confirmed' : 'is-draft',
        selected ? 'is-selected' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Left} />
      <p className="node-kind">
        {KIND_LABELS[d.kind]}
        {d.provenance === 'ai' && !d.confirmed ? (
          <span className="node-ai-tag" title="AI-drafted — edit or confirm to make it yours">
            AI
          </span>
        ) : null}
        {d.provenance === 'agent' && !d.confirmed ? (
          <span
            className="node-agent-tag"
            title="Reported by your coding agent — not visible in the GitHub record, so nothing here proves it"
          >
            AGENT
          </span>
        ) : null}
        {d.uncertain ? (
          <span className="node-uncertain" title="marked uncertain">
            ?
          </span>
        ) : null}
      </p>
      <p className="node-label">{d.label}</p>
      {d.evidence.length > 0 ? (
        <p className="node-evidence">
          {d.evidence.map((ev, i) => (
            <a key={i} href={ev.url} target="_blank" rel="noreferrer" title={ev.label}>
              evidence {d.evidence.length > 1 ? i + 1 : ''} ↗
            </a>
          ))}
        </p>
      ) : (
        <p className="node-inferred">no evidence — inferred</p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function toFlow(graph: StoryGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: 'story',
      position: n.position ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        kind: n.kind,
        provenance: n.provenance,
        confirmed: n.confirmed,
        uncertain: n.uncertain,
        evidence: n.evidence,
      } satisfies StoryNodeData,
    })),
    edges: graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label })),
  }
}

// Dangling edges are dropped here as defense in depth: a graph that fails
// StoryGraphSchema must never reach localStorage, or the next load would
// discard every user edit.
export function fromFlow(kind: StoryGraph['kind'], nodes: Node[], edges: Edge[]): StoryGraph {
  const nodeIds = new Set(nodes.map((n) => n.id))
  return {
    kind,
    nodes: nodes.map((n) => {
      const d = n.data as StoryNodeData
      return {
        id: n.id,
        kind: d.kind,
        label: d.label,
        provenance: d.provenance,
        confirmed: d.confirmed,
        uncertain: d.uncertain,
        evidence: d.evidence,
        position: { x: n.position.x, y: n.position.y },
      }
    }),
    edges: edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
  }
}
