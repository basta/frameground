import { useEditor, createShapeId } from 'tldraw'
import { useEffect } from 'react'
import { loadManifest } from '../lib/manifest'
import { HTML_FRAME_TYPE } from '../shapes/HtmlFrameShape'

export function useFrameSync() {
  const editor = useEditor()

  useEffect(() => {
    async function sync() {
      const manifest = await loadManifest()
      const existingIds = new Set(
        editor.getCurrentPageShapes()
          .filter(s => s.type === HTML_FRAME_TYPE)
          .map(s => s.id)
      )

      const toCreate = manifest.frames
        .filter(entry => !existingIds.has(createShapeId(entry.id)))
        .map(entry => ({
          id: createShapeId(entry.id),
          type: HTML_FRAME_TYPE as const,
          x: entry.x,
          y: entry.y,
          props: {
            w: entry.w,
            h: entry.h,
            name: entry.name,
            url: `/frames/${entry.file}`,
          },
        }))

      if (toCreate.length > 0) {
        editor.createShapes(toCreate)
      }
    }

    sync()
    const interval = setInterval(sync, 3000)
    return () => clearInterval(interval)
  }, [editor])
}
