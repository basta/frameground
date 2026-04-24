import { memo, useCallback, useContext, useEffect, useRef } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import type { HtmlFrameData } from './HtmlFrameShape'
import { deleteFrame, patchFrame } from '../lib/api'
import { TokensSyncContext } from '../context/TokensSyncContext'

const TITLE_BAR_HEIGHT = 32

function hoistImports(css: string): string {
  const seen = new Set<string>()
  const imports: string[] = []
  const rest: string[] = []
  for (const line of css.split('\n')) {
    if (line.trimStart().startsWith('@import')) {
      if (!seen.has(line)) { seen.add(line); imports.push(line) }
    } else {
      rest.push(line)
    }
  }
  return imports.length === 0 ? css : [...imports, ...rest].join('\n')
}

function HtmlFrameNodeComponent({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { tokensCss, overridesCss } = useContext(TokensSyncContext)

  const frameData = data as unknown as HtmlFrameData

  const postTokens = useCallback(() => {
    const raw = overridesCss ? `${tokensCss}\n${overridesCss}` : tokensCss
    const css = hoistImports(raw)
    iframeRef.current?.contentWindow?.postMessage({ type: 'od-tokens', css }, '*')
  }, [tokensCss, overridesCss])

  useEffect(() => { postTokens() }, [postTokens])

  const handleRefresh = useCallback(() => {
    iframeRef.current?.contentWindow?.location.reload()
  }, [])

  const handleEditName = useCallback(() => {
    const newName = prompt('Frame name:', frameData.name)
    if (newName === null || newName === frameData.name) return
    setNodes(nds => nds.map(n =>
      n.id === id ? { ...n, data: { ...n.data, name: newName } } : n
    ))
    if (frameData.projectId) {
      patchFrame(frameData.projectId, id, { name: newName }).catch(() => {})
    }
  }, [id, frameData.name, frameData.projectId, setNodes])

  const handleDelete = useCallback(() => {
    if (!frameData.projectId) return
    if (!confirm(`Delete frame "${frameData.name}"?`)) return
    deleteFrame(frameData.projectId, id).catch(() => {})
  }, [id, frameData.name, frameData.projectId])

  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={200} minHeight={150} />
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          border: '1px solid #e0e0e0',
          background: '#fff',
        }}
      >
        <div
          style={{
            height: TITLE_BAR_HEIGHT,
            background: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            flexShrink: 0,
          }}
        >
          <span
            onDoubleClick={handleEditName}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#333',
              cursor: 'default',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {frameData.name}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleRefresh}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                color: '#666',
                padding: '2px 6px',
                borderRadius: 4,
              }}
              title="Refresh"
            >
              ↻
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleDelete}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                color: '#666',
                padding: '2px 6px',
                borderRadius: 4,
              }}
              title="Delete"
            >
              ×
            </button>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          src={frameData.url}
          sandbox="allow-scripts allow-same-origin"
          onLoad={postTokens}
          style={{
            width: '100%',
            flex: 1,
            border: 'none',
            pointerEvents: frameData.editMode ? 'auto' : 'none',
            background: '#fff',
          }}
        />
      </div>
    </>
  )
}

export const HtmlFrameNode = memo(HtmlFrameNodeComponent)
