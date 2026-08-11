import ELK from 'elkjs'
import { NODE_WIDTH, chainLayout, nodeHeight, type StoryGraph } from './graph'

// Server-side only: elkjs is ~1.4MB and its worker shim misbehaves in
// browser bundles, so ELK runs where it is proven to work (Node) and the
// client calls it through a server action.
//
// elkjs executes synchronously on the calling thread, so a wall-clock
// timeout cannot interrupt it — CPU use is bounded instead by the size caps
// in StoryGraphSchema (≤200 nodes / ≤500 edges), which keep layouts fast.

// Roughly the shape of the map canvas (~990x620 after the maps break out of
// the prose column). ELK wraps the chain toward this ratio so the fitted zoom
// stays readable instead of collapsing to a thumbnail.
export const TARGET_ASPECT_RATIO = 1.6

/**
 * Automatic left-to-right layered layout (SPEC_V0.1 §3.4: layout is
 * automatic with manual override preserved — callers keep existing
 * positions unless they explicitly relayout). Falls back to a plain
 * layered chain if ELK errors.
 */
export async function layoutGraph(graph: StoryGraph): Promise<StoryGraph> {
  try {
    const elk = new ELK()
    const result = await elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '46',
        'elk.layered.spacing.nodeNodeBetweenLayers': '90',
        'elk.padding': '[top=16,left=16,bottom=16,right=16]',
        // A story is a long chain, and an unwrapped chain is far wider than
        // the canvas — fitView then zooms out until the labels are unreadable
        // (measured: 10 nodes => 0.30 zoom => 13px text at 3.9 physical px).
        // Wrapping the chain into rows near the canvas aspect ratio keeps the
        // whole map visible AND legible, which is the product's success moment.
        'elk.layered.wrapping.strategy': 'SINGLE_EDGE',
        'elk.aspectRatio': String(TARGET_ASPECT_RATIO),
      },
      children: graph.nodes.map((n) => ({
        id: n.id,
        width: NODE_WIDTH,
        height: nodeHeight(n.label, n.evidence.length > 0),
      })),
      edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    })

    const positions = new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
    return {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })),
    }
  } catch {
    return chainLayout(graph)
  }
}
