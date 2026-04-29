import { useCallback, useEffect, useState } from 'react'
import { useProjectEvent } from '../lib/projectEvents'

export interface DesignDoc {
  tokens: Record<string, unknown>
  body: string
  sections: { title: string; body: string }[]
}

export interface ProjectDesign {
  design: DesignDoc
  feel: { body: string; sections: { title: string; body: string }[] } | null
  parseError?: string
}

export function useDesignDoc(projectId: string): { design: ProjectDesign | null; reload: () => void } {
  const [design, setDesign] = useState<ProjectDesign | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const fetchDoc = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/design`, { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as ProjectDesign
      setDesign(json)
    } catch {
      /* ignore */
    }
  }, [projectId])

  useEffect(() => {
    fetchDoc()
  }, [fetchDoc, reloadTick])

  useProjectEvent('design-changed', () => { fetchDoc() })

  return { design, reload: () => setReloadTick(t => t + 1) }
}
