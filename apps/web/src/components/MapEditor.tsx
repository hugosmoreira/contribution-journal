'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Panel,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { isGitHubWebUrl } from '@journal/domain'
import {
  StoryGraphSchema,
  chainLayout,
  type GraphNodeKind,
  type StoryGraph,
} from '@journal/visualizations/graph'
import { KINDS, KIND_LABELS, StoryNode, fromFlow, toFlow, type StoryNodeData, LEGIBLE_ZOOM } from './flow-shared'

function loadSavedGraph(storageKey: string): StoryGraph | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const json = JSON.parse(raw)
    const parsed = StoryGraphSchema.safeParse(json)
    if (parsed.success) return parsed.data
    // Recovery for storage corrupted by older builds: drop dangling edges
    // and retry rather than throwing away every user edit.
    if (json && Array.isArray(json.nodes) && Array.isArray(json.edges)) {
      const ids = new Set(json.nodes.map((n: { id?: string }) => n?.id))
      const repaired = StoryGraphSchema.safeParse({
        ...json,
        edges: json.edges.filter((e: { source?: string; target?: string }) => ids.has(e?.source) && ids.has(e?.target)),
      })
      if (repaired.success) return repaired.data
    }
  } catch {
    // Unreadable saved state falls back to the fresh draft.
  }
  return null
}

export default function MapEditor({
  draft,
  storageKey,
  relayoutAction,
  onFirstEdit,
}: {
  draft: StoryGraph
  storageKey: string
  relayoutAction: (graph: StoryGraph) => Promise<StoryGraph>
  onFirstEdit?: () => void
}) {
  const initial = useMemo(() => toFlow(draft), [draft])
  const [nodes, setNodes] = useState<Node[]>(initial.nodes)
  const [edges, setEdges] = useState<Edge[]>(initial.edges)
  const [loaded, setLoaded] = useState(false)
  // Nothing is persisted until the user actually changes something — a
  // pristine draft in storage would pin this PR to today's draft forever.
  const [dirty, setDirty] = useState(false)
  const firstEditReported = useRef(false)

  useEffect(() => {
    if (loaded && dirty && !firstEditReported.current) {
      firstEditReported.current = true
      onFirstEdit?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, loaded])
  const [evidenceDraft, setEvidenceDraft] = useState({ label: '', url: '' })
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  // Load the saved graph (draft resilience only — the server is the source of
  // truth once persistence lands, per ADR-0002), else use the fresh draft,
  // which arrives already laid out by the server.
  useEffect(() => {
    const saved = loadSavedGraph(storageKey)
    let graph = saved ?? draft
    if (graph.nodes.some((n) => !n.position)) {
      graph = chainLayout(graph)
    }
    const flow = toFlow(graph)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    // A previously saved graph means the user has edits worth keeping.
    setDirty(Boolean(saved))
    setLoaded(true)
  }, [draft, storageKey])

  // Gated on the `loaded` STATE (not a ref): state updates commit atomically
  // with the render, so this cannot run against pre-load nodes and overwrite
  // the saved graph with the pristine draft (StrictMode double-mount safe).
  useEffect(() => {
    if (!loaded || !dirty) return
    try {
      const graph = fromFlow(draft.kind, nodes, edges)
      // Never persist anything the schema would reject on the next load —
      // an invalid write would silently discard every saved edit.
      if (StoryGraphSchema.safeParse(graph).success) {
        localStorage.setItem(storageKey, JSON.stringify(graph))
      }
    } catch {
      // Storage full or blocked: editing still works, it just won't survive reload.
    }
  }, [nodes, edges, loaded, dirty, storageKey, draft.kind])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true)
    setNodes((ns) => applyNodeChanges(changes, ns))
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (changes.some((c) => c.type !== 'select')) setDirty(true)
    setEdges((es) => applyEdgeChanges(changes, es))
  }, [])
  const onConnect = useCallback((connection: Connection) => {
    setDirty(true)
    setEdges((es) =>
      addEdge(
        // Timestamp first so the uniqueness-bearing part survives the
        // schema's 120-char id cap even for long node ids.
        { ...connection, id: `e-${Date.now()}-${connection.source}-${connection.target}`.slice(0, 120) },
        es,
      ),
    )
  }, [])

  const selected = nodes.find((n) => n.selected)
  const selectedId = selected?.id
  const selectedData = selected?.data as StoryNodeData | undefined

  // Patches exactly the node shown in the inspector — never the whole
  // multi-selection. Editing marks that node user-confirmed (SPEC_V0.1 §3.5).
  const updateSelected = useCallback(
    (patch: Partial<StoryNodeData>) => {
      if (!selectedId) return
      setDirty(true)
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== selectedId) return n
          const d = n.data as StoryNodeData
          return { ...n, data: { ...d, ...patch, provenance: 'user', confirmed: true } }
        }),
      )
    },
    [selectedId],
  )

  const addNode = useCallback(() => {
    setDirty(true)
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      {
        id: `user-${Date.now()}`,
        type: 'story',
        position: { x: 60, y: 60 + ns.length * 24 },
        selected: true,
        data: {
          label: 'New node — describe it',
          kind: 'hypothesis',
          provenance: 'user',
          confirmed: true,
          uncertain: false,
          evidence: [],
        } satisfies StoryNodeData,
      },
    ])
  }, [])

  // Removes EVERY selected node and every edge touching any of them —
  // a dangling edge here would invalidate the persisted graph.
  const deleteSelected = useCallback(() => {
    const removed = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    if (removed.size === 0) return
    setDirty(true)
    setNodes((ns) => ns.filter((n) => !removed.has(n.id)))
    setEdges((es) => es.filter((e) => !removed.has(e.source) && !removed.has(e.target)))
  }, [nodes])

  // Applies only the returned positions: edits or connections made while the
  // server action is in flight are never discarded, and selection survives.
  const relayout = useCallback(async () => {
    const graph = fromFlow(draft.kind, nodes, edges)
    let laidOut: StoryGraph
    try {
      // ELK runs server-side (server action); the plain chain layout is the
      // offline/error fallback.
      laidOut = await relayoutAction({
        ...graph,
        nodes: graph.nodes.map((n) => ({ ...n, position: undefined })),
      })
    } catch {
      laidOut = chainLayout(graph)
    }
    const positions = new Map(laidOut.nodes.map((n) => [n.id, n.position]))
    setDirty(true)
    setNodes((ns) =>
      ns.map((n) => {
        const p = positions.get(n.id)
        return p ? { ...n, position: p } : n
      }),
    )
  }, [draft.kind, nodes, edges, relayoutAction])

  const resetToDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Nothing saved — resetting to the draft still proceeds.
    }
    const base = draft.nodes.some((n) => !n.position) ? chainLayout(draft) : draft
    const flow = toFlow(base)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    // Back to pristine: nothing re-persists until the user edits again.
    setDirty(false)
  }, [draft, storageKey])

  const addEvidence = useCallback(() => {
    const url = evidenceDraft.url.trim()
    const label = evidenceDraft.label.trim() || url
    if (!isGitHubWebUrl(url)) {
      setEvidenceError('Evidence must be an https://github.com/… link.')
      return
    }
    if ((selectedData?.evidence.length ?? 0) >= 10) {
      setEvidenceError('A node can hold up to 10 evidence links.')
      return
    }
    setEvidenceError(null)
    setEvidenceDraft({ label: '', url: '' })
    updateSelected({ evidence: [...(selectedData?.evidence ?? []), { label: label.slice(0, 200), url }] })
  }, [evidenceDraft, selectedData?.evidence, updateSelected])

  const removeEvidence = useCallback(
    (index: number) => {
      updateSelected({ evidence: (selectedData?.evidence ?? []).filter((_, i) => i !== index) })
    },
    [selectedData?.evidence, updateSelected],
  )

  const nodeTypes = useMemo(() => ({ story: StoryNode }), [])

  return (
    <div className="map-editor">
      <div className="map-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          // Never open below a legible zoom: fitting a long story chain to the
          // canvas rendered 13px labels at ~4 physical px. A readable map the
          // reader can pan beats an unreadable thumbnail; manual zoom-out still
          // goes to minZoom.
          fitViewOptions={{ padding: 0.16, minZoom: LEGIBLE_ZOOM }}
          minZoom={0.3}
          maxZoom={1.6}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: { strokeWidth: 1.5 },
          }}
          colorMode="dark"
        >
          <Background gap={22} size={1.2} />
          <Controls showInteractive={false} />
          <Panel position="top-left" className="map-toolbar">
            <button type="button" onClick={addNode}>
              + Node
            </button>
            <button type="button" onClick={() => void relayout()}>
              Auto-layout
            </button>
            <button type="button" onClick={resetToDraft}>
              Reset to draft
            </button>
          </Panel>
        </ReactFlow>
      </div>
      <aside className="map-inspector">
        {selectedData ? (
          <div className="inspector-body">
            <label>
              <span>Label</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={selectedData.label}
                onChange={(e) => updateSelected({ label: e.target.value })}
              />
            </label>
            <label>
              <span>Type</span>
              <select
                value={selectedData.kind}
                onChange={(e) => updateSelected({ kind: e.target.value as GraphNodeKind })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="inspector-check">
              <input
                type="checkbox"
                checked={selectedData.uncertain}
                onChange={(e) => updateSelected({ uncertain: e.target.checked })}
              />
              <span>I&apos;m not sure about this</span>
            </label>
            <div className="inspector-evidence">
              <span className="inspector-heading">Evidence</span>
              {selectedData.evidence.length === 0 ? (
                <p className="inspector-note">None linked — node counts as inferred.</p>
              ) : (
                selectedData.evidence.map((ev, i) => (
                  <p key={i} className="evidence-row">
                    <a href={ev.url} target="_blank" rel="noreferrer" title={ev.url}>
                      {ev.label.slice(0, 32) || ev.url.slice(0, 32)}
                    </a>
                    <button type="button" aria-label="remove evidence" onClick={() => removeEvidence(i)}>
                      ×
                    </button>
                  </p>
                ))
              )}
              <input
                placeholder="github.com link"
                value={evidenceDraft.url}
                onChange={(e) => setEvidenceDraft((d) => ({ ...d, url: e.target.value }))}
              />
              <input
                placeholder="label (optional)"
                maxLength={200}
                value={evidenceDraft.label}
                onChange={(e) => setEvidenceDraft((d) => ({ ...d, label: e.target.value }))}
              />
              <button type="button" className="add-evidence-btn" onClick={addEvidence}>
                Link evidence
              </button>
              {evidenceError ? <p className="inspector-error">{evidenceError}</p> : null}
            </div>
            {!selectedData.confirmed ? (
              <button type="button" className="confirm-btn" onClick={() => updateSelected({})}>
                ✓ Confirm this node
              </button>
            ) : null}
            <button type="button" className="danger-btn" onClick={deleteSelected}>
              Delete node
            </button>
          </div>
        ) : (
          <p className="inspector-hint">
            {loaded
              ? 'Click a node to edit it. Drag between node edges to connect. Dashed nodes are unconfirmed drafts.'
              : 'Laying out the map…'}
          </p>
        )}
      </aside>
    </div>
  )
}
