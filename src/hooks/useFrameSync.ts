import { useEffect } from 'react'
import type { Node } from '@xyflow/react'
import { loadManifest } from '../lib/manifest'
import { HTML_FRAME_TYPE } from '../shapes/HtmlFrameShape'

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>

export function useFrameSync(setNodes: SetNodes) {
  useEffect(() => {
    async function sync() {
      const manifest = await loadManifest()

      setNodes(current => {
        const existingIds = new Set(current.map(n => n.id))
        const toCreate = manifest.frames
          .filter(entry => !existingIds.has(entry.id))
          .map(entry => ({
            id: entry.id,
            type: HTML_FRAME_TYPE,
            position: { x: entry.x, y: entry.y },
            style: { width: entry.w, height: entry.h + 32 },
            data: {
              name: entry.name,
              url: `/frames/${entry.file}`,
              editMode: false,
            },
          }))

        if (toCreate.length === 0) return current
        return [...current, ...toCreate]
      })
    }

    sync()
    const interval = setInterval(sync, 3000)
    return () => clearInterval(interval)
  }, [setNodes])
}
