import { useEffect, useState } from 'react'

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

  useEffect(() => {
    let cancelled = false

    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/design`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as ProjectDesign
        if (!cancelled) setDesign(json)
      } catch {
        /* ignore */
      }
    }

    fetchDoc()

    const source = new EventSource(`/api/projects/${projectId}/events`)
    source.addEventListener('design-changed', () => { fetchDoc() })

    return () => {
      cancelled = true
      source.close()
    }
  }, [projectId, reloadTick])

  return { design, reload: () => setReloadTick(t => t + 1) }
}
