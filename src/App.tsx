import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { HtmlFrameShapeUtil } from './shapes/HtmlFrameShapeUtil'
import { useFrameSync } from './hooks/useFrameSync'

const customShapeUtils = [HtmlFrameShapeUtil]

function FrameSyncInner() {
  useFrameSync()
  return null
}

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        persistenceKey="opendesign"
      >
        <FrameSyncInner />
      </Tldraw>
    </div>
  )
}
