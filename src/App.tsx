import { ReactFlow, ReactFlowProvider, useNodesState, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { HtmlFrameNode } from './shapes/HtmlFrameNode'
import { useFrameSync } from './hooks/useFrameSync'

const nodeTypes = { 'html-frame': HtmlFrameNode }

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  useFrameSync(setNodes)

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={onNodesChange}
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
  )
}

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </div>
  )
}
