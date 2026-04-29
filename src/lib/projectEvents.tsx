import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// Single shared EventSource for `/api/projects/:id/events` so all subscribers
// (frame sync, tokens, design doc, suggestions) share one HTTP/1.1 connection.
// Browsers cap concurrent connections at 6/origin, and SSE holds them
// indefinitely — opening one per hook starves fetch() and stalls POSTs.

const Ctx = createContext<EventSource | null>(null)

export function ProjectEventsProvider({
  projectId,
  children,
}: {
  projectId: string
  children: ReactNode
}) {
  const [source, setSource] = useState<EventSource | null>(null)

  useEffect(() => {
    const s = new EventSource(`/api/projects/${projectId}/events`)
    setSource(s)
    return () => {
      s.close()
      setSource(null)
    }
  }, [projectId])

  return <Ctx.Provider value={source}>{children}</Ctx.Provider>
}

export function useProjectEvent(
  eventName: string,
  handler: (e: MessageEvent) => void,
): void {
  const source = useContext(Ctx)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!source) return
    const fn = (e: Event) => handlerRef.current(e as MessageEvent)
    source.addEventListener(eventName, fn)
    return () => source.removeEventListener(eventName, fn)
  }, [source, eventName])
}
