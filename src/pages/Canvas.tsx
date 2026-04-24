import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useTokenSync } from '../hooks/useTokenSync'
import { useDesignDoc } from '../hooks/useDesignDoc'
import { useSuggestions } from '../hooks/useSuggestions'
import { TokensSyncContext } from '../context/TokensSyncContext'
import { TokensPanel } from '../components/TokensPanel'
import { deleteFrame, dismissSuggestion, patchLayout } from '../lib/api'
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

function toKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function pathToCssVar(path: string[]): string {
  return '--' + path.map(toKebab).join('-')
}

function buildOverridesCss(overrides: Map<string, string>): string {
  if (overrides.size === 0) return ''
  const families: string[] = []
  const decls: string[] = []
  for (const [key, value] of overrides) {
    decls.push(`  ${pathToCssVar(key.split('.'))}: ${value};`)
    if (key.split('.').pop() === 'fontFamily' && !value.startsWith('var(')) {
      families.push(value)
    }
  }
  const imports = families
    .map(f => `@import url('https://fonts.googleapis.com/css2?family=${f.replace(/\s+/g, '+')}:wght@200;300;400;500;600;700&display=swap');`)
    .join('\n')
  const root = `:root {\n${decls.join('\n')}\n}\n`
  return imports ? `${imports}\n${root}` : root
}

function CanvasInner({ projectId }: { projectId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const { loading } = useFrameSync(projectId, setNodes)
  const { tokensCss } = useTokenSync(projectId)
  const { design } = useDesignDoc(projectId)
  const { suggestions } = useSuggestions(projectId)
  const writeLayout = useLayoutWriter(projectId)

  const [panelOpen, setPanelOpen] = useState(false)
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map())

  const overridesCss = useMemo(() => buildOverridesCss(overrides), [overrides])
  const tokensSyncValue = useMemo(() => ({ tokensCss, overridesCss }), [tokensCss, overridesCss])

  const setOverride = useCallback((path: string[], value: string | null) => {
    setOverrides(prev => {
      const next = new Map(prev)
      const key = path.join('.')
      if (value === null) next.delete(key)
      else next.set(key, value)
      return next
    })
  }, [])

  const applyVariant = useCallback((tokens: Record<string, unknown>) => {
    setOverrides(prev => {
      const next = new Map(prev)
      const visit = (val: unknown, path: string[]) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const k of Object.keys(val as Record<string, unknown>)) {
            visit((val as Record<string, unknown>)[k], [...path, k])
          }
        } else if (typeof val === 'string' || typeof val === 'number') {
          next.set(path.join('.'), String(val))
        }
      }
      visit(tokens, [])
      return next
    })
  }, [])

  const handleDismissSuggestion = useCallback((id: string) => {
    dismissSuggestion(projectId, id).catch(() => {})
  }, [projectId])

  const resetOverrides = useCallback(() => setOverrides(new Map()), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 't' && e.key !== 'T') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      setPanelOpen(o => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  const handleBeforeDelete = useCallback(async ({ nodes: deleted }: { nodes: Node[] }) => {
    const confirmed = deleted.filter(node =>
      confirm(`Delete frame "${(node.data as { name?: string }).name ?? node.id}"?`)
    )
    for (const node of confirmed) {
      deleteFrame(projectId, node.id).catch(() => {})
    }
    return false
  }, [projectId])

  const nodesWithProject = useMemo(
    () => nodes.map(n => ({ ...n, data: { ...n.data, projectId } })),
    [nodes, projectId],
  )

  return (
    <TokensSyncContext.Provider value={tokensSyncValue}>
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {loading && <span style={{ fontSize: 13, color: '#666' }}>Loading…</span>}
          {!panelOpen && (
            <button
              onClick={() => setPanelOpen(true)}
              title="Tokens (T)"
              style={{
                background: 'rgba(255,255,255,0.9)',
                border: '1px solid #d8d8d8',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}
            >
              Tokens
            </button>
          )}
        </div>
        <ReactFlow
          nodes={nodesWithProject}
          edges={[]}
          onNodesChange={wrappedOnNodesChange}
          onBeforeDelete={handleBeforeDelete}
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
      {panelOpen && (
        <TokensPanel
          projectId={projectId}
          design={design}
          overrides={overrides}
          suggestions={suggestions}
          onSetOverride={setOverride}
          onApplyVariant={applyVariant}
          onDismissSuggestion={handleDismissSuggestion}
          onReset={resetOverrides}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
    </TokensSyncContext.Provider>
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
