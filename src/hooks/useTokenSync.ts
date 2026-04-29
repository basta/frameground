import { useCallback, useEffect, useState } from 'react'
import { useProjectEvent } from '../lib/projectEvents'

export function useTokenSync(projectId: string): { tokensCss: string } {
  const [tokensCss, setTokensCss] = useState('')

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/tokens.css`, { cache: 'no-store' })
      if (!res.ok) return
      const text = await res.text()
      setTokensCss(text)
    } catch {
      /* ignore */
    }
  }, [projectId])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  useProjectEvent('design-changed', () => { fetchTokens() })

  return { tokensCss }
}
