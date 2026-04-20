import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  Background,
  Controls,
  type NodeChange,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { HtmlFrameNode } from '../shapes/HtmlFrameNode'
import { useFrameSync } from '../hooks/useFrameSync'
import { deleteFrame, patchLayout } from '../lib/api'
import type { LayoutEntry } from '../lib/manifest'

const nodeTypes = { 'html-frame': HtmlFrameNode }
const TITLE_BAR_HEIGHT = 32
const LAYOUT_DEBOUNCE_MS = 250

type PendingLayout = Partial<LayoutEntry>

function useLayoutWriter(projectId: string) {
  const pending = useRef<Map<string, PendingLayout>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const batch = pending.current
    pending.current = new Map()
    timer.current = null
    for (const [frameId, patch] of batch) {
      patchLayout(projectId, frameId, patch).catch(() => {})
    }
  }, [projectId])

  const enqueue = useCallback((frameId: string, patch: PendingLayout) => {
    const current = pending.current.get(frameId) ?? {}
    pending.current.set(frameId, { ...current, ...patch })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, LAYOUT_DEBOUNCE_MS)
  }, [flush])

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      flush()
    }
  }, [flush])

  return enqueue
}

function CanvasInner({ projectId }: { projectId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const { loading } = useFrameSync(projectId, setNodes)
  const writeLayout = useLayoutWriter(projectId)

  const wrappedOnNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    for (const change of changes) {
      if (change.type === 'position' && change.position && change.dragging === false) {
        writeLayout(change.id, { x: change.position.x, y: change.position.y })
      }
      if (change.type === 'dimensions' && change.dimensions && change.resizing === false) {
        writeLayout(change.id, {
          w: change.dimensions.width,
          h: Math.max(0, change.dimensions.height - TITLE_BAR_HEIGHT),
        })
      }
    }
  }, [onNodesChange, writeLayout])

  const handleNodesDelete = useCallback((deleted: Node[]) => {
    for (const node of deleted) {
      if (!confirm(`Delete frame "${(node.data as { name?: string }).name ?? node.id}"?`)) continue
      deleteFrame(projectId, node.id).catch(() => {})
    }
  }, [projectId])

  const nodesWithProject = useMemo(
    () => nodes.map(n => ({ ...n, data: { ...n.data, projectId } })),
    [nodes, projectId],
  )

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          background: 'rgba(255,255,255,0.9)',
          padding: '6px 12px',
          borderRadius: 6,
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          fontSize: 13,
          fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        }}
      >
        <Link to="/" style={{ color: '#666', textDecoration: 'none' }}>← Projects</Link>
        <span style={{ margin: '0 8px', color: '#ccc' }}>/</span>
        <span style={{ fontWeight: 600 }}>{projectId}</span>
      </div>
      {loading && (
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, fontSize: 13, color: '#666' }}>
          Loading…
        </div>
      )}
      <ReactFlow
        nodes={nodesWithProject}
        edges={[]}
        onNodesChange={wrappedOnNodesChange}
        onNodesDelete={handleNodesDelete}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        fitView
        minZoom={0.1}
        maxZoom={4}
        onNodeDoubleClick={(_, node) => {
          setNodes(nds => nds.map(n =>
            n.id === node.id ? { ...n, data: { ...n.data, editMode: true } } : n
          ))
        }}
        onPaneClick={() => {
          setNodes(nds => nds.map(n =>
            n.data.editMode ? { ...n, data: { ...n.data, editMode: false } } : n
          ))
        }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

export function Canvas() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return <div>Missing project id</div>
  return (
    <ReactFlowProvider key={projectId}>
      <CanvasInner projectId={projectId} />
    </ReactFlowProvider>
  )
}
