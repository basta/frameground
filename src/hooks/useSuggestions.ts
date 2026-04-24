import { useEffect, useState } from 'react'
import { fetchSuggestions, type Suggestion } from '../lib/api'

export function useSuggestions(projectId: string): { suggestions: Suggestion[] } {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  useEffect(() => {
    let cancelled = false

    const reload = async () => {
      try {
        const { suggestions: list } = await fetchSuggestions(projectId)
        if (!cancelled) setSuggestions(list)
      } catch {
        /* ignore */
      }
    }

    reload()

    const source = new EventSource(`/api/projects/${projectId}/events`)
    source.addEventListener('suggestions-changed', () => { reload() })

    return () => {
      cancelled = true
      source.close()
    }
  }, [projectId])

  return { suggestions }
}
