import { useCallback, useEffect, useState } from 'react'
import { fetchSuggestions, type Suggestion } from '../lib/api'
import { useProjectEvent } from '../lib/projectEvents'

export function useSuggestions(projectId: string): { suggestions: Suggestion[] } {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  const reload = useCallback(async () => {
    try {
      const { suggestions: list } = await fetchSuggestions(projectId)
      setSuggestions(list)
    } catch {
      /* ignore */
    }
  }, [projectId])

  useEffect(() => {
    reload()
  }, [reload])

  useProjectEvent('suggestions-changed', () => { reload() })

  return { suggestions }
}
