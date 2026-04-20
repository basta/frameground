import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { ServerResponse } from 'http'
import { projectDir, projectExists } from './projects.ts'

type Channel = {
  watcher: FSWatcher
  subs: Set<ServerResponse>
}

const channels = new Map<string, Channel>()
const DEBOUNCE_MS = 80

function broadcast(projectId: string, event: string, data: unknown): void {
  const ch = channels.get(projectId)
  if (!ch) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of ch.subs) {
    try {
      res.write(payload)
    } catch {
      ch.subs.delete(res)
    }
  }
}

function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as T
}

function ensureChannel(projectId: string): Channel {
  const existing = channels.get(projectId)
  if (existing) return existing

  const dir = projectDir(projectId)
  const watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    ignored: (p: string) => {
      const rel = path.relative(dir, p)
      if (!rel || rel === '.') return false
      if (rel === 'node_modules' || rel.startsWith('node_modules' + path.sep)) return true
      return false
    },
  })

  const emitManifest = debounce(() => broadcast(projectId, 'manifest-changed', {}), DEBOUNCE_MS)
  const emitLayout = debounce(() => broadcast(projectId, 'layout-changed', {}), DEBOUNCE_MS)
  const emitFile = debounce((frameId: string) => broadcast(projectId, 'file-changed', { frameId }), DEBOUNCE_MS)
  const emitDesign = debounce(() => broadcast(projectId, 'design-changed', {}), DEBOUNCE_MS)

  const onChange = (p: string) => {
    const rel = path.relative(dir, p)
    if (rel === 'frames.json') emitManifest()
    else if (rel === path.join('.opendesign', 'layout.json')) emitLayout()
    else if (rel === 'DESIGN.md') emitDesign()
    else if (rel.endsWith('.html')) emitFile(path.basename(rel, '.html'))
  }

  watcher.on('add', onChange)
  watcher.on('change', onChange)
  watcher.on('unlink', onChange)

  const channel: Channel = { watcher, subs: new Set() }
  channels.set(projectId, channel)
  return channel
}

export function subscribe(projectId: string, res: ServerResponse): boolean {
  if (!projectExists(projectId)) return false
  const ch = ensureChannel(projectId)
  ch.subs.add(res)
  res.on('close', () => {
    ch.subs.delete(res)
    if (ch.subs.size === 0) {
      ch.watcher.close()
      channels.delete(projectId)
    }
  })
  return true
}
