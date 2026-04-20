import { memo, useCallback, useRef } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import type { HtmlFrameData } from './HtmlFrameShape'

const TITLE_BAR_HEIGHT = 32

function HtmlFrameNodeComponent({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const frameData = data as unknown as HtmlFrameData

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }, [])

  const handleEditName = useCallback(() => {
    const newName = prompt('Frame name:', frameData.name)
    if (newName !== null) {
      setNodes(nds => nds.map(n =>
        n.id === id ? { ...n, data: { ...n.data, name: newName } } : n
      ))
    }
  }, [id, frameData.name, setNodes])

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
          <button
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
        </div>
        <iframe
          ref={iframeRef}
          src={frameData.url}
          sandbox="allow-scripts allow-same-origin"
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
