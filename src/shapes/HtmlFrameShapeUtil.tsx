import { BaseBoxShapeUtil, HTMLContainer, useEditor, useIsEditing } from 'tldraw'
import { HTML_FRAME_TYPE } from './HtmlFrameShape'
import type { HtmlFrameShape } from './HtmlFrameShape'
import { useCallback, useRef } from 'react'

const TITLE_BAR_HEIGHT = 32

export class HtmlFrameShapeUtil extends BaseBoxShapeUtil<HtmlFrameShape> {
  static override type = HTML_FRAME_TYPE as const

  getDefaultProps(): HtmlFrameShape['props'] {
    return { w: 800, h: 600, name: 'Untitled', url: '' }
  }

  override canEdit() { return true }

  component(shape: HtmlFrameShape) {
    return <HtmlFrameComponent shape={shape} />
  }

  indicator(shape: HtmlFrameShape) {
    return <rect width={shape.props.w} height={shape.props.h + TITLE_BAR_HEIGHT} rx={8} />
  }
}

function HtmlFrameComponent({ shape }: { shape: HtmlFrameShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }, [])

  const handleEditName = useCallback(() => {
    const newName = prompt('Frame name:', shape.props.name)
    if (newName !== null) {
      editor.updateShapes([{ id: shape.id, type: HTML_FRAME_TYPE, props: { name: newName } }])
    }
  }, [editor, shape.id, shape.props.name])

  return (
    <HTMLContainer>
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h + TITLE_BAR_HEIGHT,
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
            {shape.props.name}
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
          src={shape.props.url}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: '100%',
            flex: 1,
            border: 'none',
            pointerEvents: isEditing ? 'auto' : 'none',
            background: '#fff',
          }}
        />
      </div>
    </HTMLContainer>
  )
}
