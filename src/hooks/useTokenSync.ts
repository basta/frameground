import { useEffect, useState } from 'react'

export function useTokenSync(projectId: string): { tokensCss: string } {
  const [tokensCss, setTokensCss] = useState('')

  useEffect(() => {
    let cancelled = false

    const fetchTokens = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/tokens.css`, { cache: 'no-store' })
        if (!res.ok) return
        const text = await res.text()
        if (!cancelled) setTokensCss(text)
      } catch {
        /* ignore */
      }
    }

    fetchTokens()

    const source = new EventSource(`/api/projects/${projectId}/events`)
    source.addEventListener('design-changed', () => { fetchTokens() })

    return () => {
      cancelled = true
      source.close()
    }
  }, [projectId])

  return { tokensCss }
}
