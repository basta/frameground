import { useEffect, useState, useCallback } from 'react'
import type { Node } from '@xyflow/react'
import { HTML_FRAME_TYPE } from '../shapes/HtmlFrameShape'
import { getLayout, getManifest } from '../lib/api'
import { DEFAULT_LAYOUT, type FrameEntry, type Layout } from '../lib/manifest'

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>

function buildNode(projectId: string, entry: FrameEntry, layout = DEFAULT_LAYOUT, version = 0): Node {
  return {
    id: entry.id,
    type: HTML_FRAME_TYPE,
    position: { x: layout.x, y: layout.y },
    style: { width: layout.w, height: layout.h + 32 },
    data: {
      name: entry.name,
      url: `/frames/${projectId}/${entry.file}?v=${version}`,
      editMode: false,
    },
  }
}

export function useFrameSync(projectId: string, setNodes: SetNodes) {
  const [loading, setLoading] = useState(true)

  const reconcileManifest = useCallback(async () => {
    const m = await getManifest(projectId)
    const layout = await getLayout(projectId)
    setNodes(current => {
      const byId = new Map(current.map(n => [n.id, n]))
      return m.frames.map(entry => {
        const existing = byId.get(entry.id)
        const l = layout[entry.id] ?? DEFAULT_LAYOUT
        if (existing) {
          return { ...existing, data: { ...existing.data, name: entry.name } }
        }
        return buildNode(projectId, entry, l)
      })
    })
  }, [projectId, setNodes])

  const reconcileLayout = useCallback(async () => {
    const layout: Layout = await getLayout(projectId)
    setNodes(current => current.map(n => {
      const l = layout[n.id]
      if (!l) return n
      const w = l.w
      const h = l.h + 32
      const samePos = n.position.x === l.x && n.position.y === l.y
      const currentStyle = n.style ?? {}
      const sameSize = currentStyle.width === w && currentStyle.height === h
      if (samePos && sameSize) return n
      return {
        ...n,
        position: { x: l.x, y: l.y },
        style: { ...currentStyle, width: w, height: h },
      }
    }))
  }, [projectId, setNodes])

  const bumpFileVersion = useCallback((frameId: string) => {
    setNodes(current => current.map(n => {
      if (n.id !== frameId) return n
      const data = n.data as { url?: string }
      const url = data.url ?? ''
      const base = url.split('?')[0]
      return { ...n, data: { ...n.data, url: `${base}?v=${Date.now()}` } }
    }))
  }, [setNodes])

  useEffect(() => {
    let cancelled = false

    Promise.all([getManifest(projectId), getLayout(projectId)])
      .then(([m, layout]) => {
        if (cancelled) return
        setNodes(m.frames.map(f => buildNode(projectId, f, layout[f.id] ?? DEFAULT_LAYOUT)))
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    const source = new EventSource(`/api/projects/${projectId}/events`)
    source.addEventListener('manifest-changed', () => { reconcileManifest() })
    source.addEventListener('layout-changed', () => { reconcileLayout() })
    source.addEventListener('file-changed', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { frameId?: string }
        if (data.frameId) bumpFileVersion(data.frameId)
      } catch { /* ignore */ }
    })

    return () => {
      cancelled = true
      source.close()
    }
  }, [projectId, setNodes, reconcileManifest, reconcileLayout, bumpFileVersion])

  return { loading }
}
