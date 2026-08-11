'use client'

import { useMemo } from 'react'
import { Background, Controls, MarkerType, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { StoryGraph } from '@journal/visualizations/graph'
import { StoryNode, toFlow, LEGIBLE_ZOOM } from './flow-shared'

/**
 * The published, read-only rendering of a map: same nodes and evidence links
 * as the editor, but nothing can be moved, connected, or deleted.
 */
export default function ReadOnlyMap({ graph }: { graph: StoryGraph }) {
  const flow = useMemo(() => toFlow(graph), [graph])
  const nodeTypes = useMemo(() => ({ story: StoryNode }), [])

  return (
    <div className="map-editor readonly">
      <div className="map-canvas">
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          fitView
          // Same legibility floor as the editor — see MapEditor.
          fitViewOptions={{ padding: 0.16, minZoom: LEGIBLE_ZOOM }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: { strokeWidth: 1.5 },
          }}
          colorMode="dark"
        >
          <Background gap={22} size={1.2} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}
