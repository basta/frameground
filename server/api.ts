import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { createProject, listProjects, projectDir, projectExists, projectsRoot, resolveFrameFile, validProjectId } from './projects.ts'
import { appendFrame, patchFrame, readManifest, removeFrame } from './manifest.ts'
import { patchLayoutEntry, readLayout, removeLayoutEntry } from './layout.ts'
import { readProjectDesign, tokensToCss, writeDesignTokens } from './design.ts'
import { isValidSuggestionId, listSuggestions, removeSuggestion } from './suggestions.ts'
import { subscribe } from './watcher.ts'
import type { FrameEntry, LayoutEntry } from './types.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, match: RegExpMatchArray) => Promise<void> | void

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function error(res: ServerResponse, status: number, message: string): void {
  json(res, status, { error: message })
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const routes: { method: string; pattern: RegExp; handler: Handler }[] = [
  {
    method: 'GET',
    pattern: /^\/api\/workspace$/,
    handler: (_req, res) => {
      const root = projectsRoot()
      json(res, 200, {
        root,
        projects: listProjects().map(id => ({ id, path: projectDir(id) })),
      })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects$/,
    handler: (_req, res) => json(res, 200, { projects: listProjects() }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects$/,
    handler: async (req, res) => {
      const body = (await readBody(req)) as { name?: unknown }
      const name = asString(body.name)
      if (!name || !validProjectId(name)) return error(res, 400, 'Invalid project name')
      if (projectExists(name)) return error(res, 409, 'Project already exists')
      createProject(name)
      json(res, 201, { id: name })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/manifest$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, readManifest(id))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/layout$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, readLayout(id))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/design$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, readProjectDesign(id))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/tokens\.css$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const { design, parseError } = readProjectDesign(id)
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/css; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.end(tokensToCss(design.tokens, parseError))
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/projects\/([^/]+)\/design\/tokens$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { tokens?: unknown }
      const patch = body.tokens
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return error(res, 400, 'tokens object required')
      }
      writeDesignTokens(id, patch as Record<string, unknown>)
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/projects\/([^/]+)\/frames$/,
    handler: async (req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as {
        id?: unknown; name?: unknown; file?: unknown; html?: unknown
        x?: unknown; y?: unknown; w?: unknown; h?: unknown
      }
      const frameId = asString(body.id)
      const name = asString(body.name)
      const file = asString(body.file)
      if (!frameId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(frameId)) return error(res, 400, 'Invalid frame id')
      if (!name || !file) return error(res, 400, 'name and file required')
      const resolved = resolveFrameFile(id, file)
      if (!resolved) return error(res, 400, 'Invalid file path')

      const html = asString(body.html)
      if (html !== null) fs.writeFileSync(resolved, html)

      const entry: FrameEntry = { id: frameId, name, file }
      try {
        appendFrame(id, entry)
      } catch (e) {
        return error(res, 409, (e as Error).message)
      }

      const layoutPatch: Partial<LayoutEntry> = {}
      const x = asNumber(body.x); if (x !== null) layoutPatch.x = x
      const y = asNumber(body.y); if (y !== null) layoutPatch.y = y
      const w = asNumber(body.w); if (w !== null) layoutPatch.w = w
      const h = asNumber(body.h); if (h !== null) layoutPatch.h = h
      const layout = patchLayoutEntry(id, frameId, layoutPatch)

      json(res, 201, { frame: entry, layout })
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/projects\/([^/]+)\/frames\/([^/]+)$/,
    handler: async (req, res, m) => {
      const [, id, frameId] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { name?: unknown; file?: unknown }
      const patch: Partial<Omit<FrameEntry, 'id'>> = {}
      const name = asString(body.name); if (name !== null) patch.name = name
      const file = asString(body.file); if (file !== null) {
        if (!resolveFrameFile(id, file)) return error(res, 400, 'Invalid file path')
        patch.file = file
      }
      const updated = patchFrame(id, frameId, patch)
      if (!updated) return error(res, 404, 'Frame not found')
      json(res, 200, updated)
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/projects\/([^/]+)\/frames\/([^/]+)$/,
    handler: async (req, res, m) => {
      const [, id, frameId] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const url = new URL(req.url ?? '', 'http://localhost')
      const deleteFile = url.searchParams.get('deleteFile') === 'true'
      const removed = removeFrame(id, frameId)
      if (!removed) return error(res, 404, 'Frame not found')
      removeLayoutEntry(id, frameId)
      if (deleteFile) {
        const resolved = resolveFrameFile(id, removed.file)
        if (resolved && fs.existsSync(resolved)) fs.unlinkSync(resolved)
      }
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/projects\/([^/]+)\/layout\/([^/]+)$/,
    handler: async (req, res, m) => {
      const [, id, frameId] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      const body = (await readBody(req)) as { x?: unknown; y?: unknown; w?: unknown; h?: unknown }
      const patch: Partial<LayoutEntry> = {}
      const x = asNumber(body.x); if (x !== null) patch.x = x
      const y = asNumber(body.y); if (y !== null) patch.y = y
      const w = asNumber(body.w); if (w !== null) patch.w = w
      const h = asNumber(body.h); if (h !== null) patch.h = h
      const updated = patchLayoutEntry(id, frameId, patch)
      json(res, 200, updated)
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/suggestions$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      json(res, 200, { suggestions: listSuggestions(id) })
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/projects\/([^/]+)\/suggestions\/([^/]+)$/,
    handler: (_req, res, m) => {
      const [, id, sid] = m
      if (!projectExists(id)) return error(res, 404, 'Project not found')
      if (!isValidSuggestionId(sid)) return error(res, 400, 'Invalid suggestion id')
      const ok = removeSuggestion(id, sid)
      if (!ok) return error(res, 404, 'Suggestion not found')
      json(res, 200, { ok: true })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/projects\/([^/]+)\/events$/,
    handler: (_req, res, m) => {
      const [, id] = m
      if (!projectExists(id)) { error(res, 404, 'Project not found'); return }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.write(': connected\n\n')
      const ok = subscribe(id, res)
      if (!ok) { res.end(); return }
    },
  },
]

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const urlPath = (req.url ?? '').split('?')[0]
  if (!urlPath.startsWith('/api/')) return false
  for (const route of routes) {
    if (route.method !== req.method) continue
    const match = urlPath.match(route.pattern)
    if (!match) continue
    try {
      await route.handler(req, res, match)
    } catch (e) {
      error(res, 500, (e as Error).message)
    }
    return true
  }
  error(res, 404, 'Not found')
  return true
}

export function handleFrames(req: IncomingMessage, res: ServerResponse): boolean {
  const urlPath = (req.url ?? '').split('?')[0]
  const match = urlPath.match(/^\/frames\/([^/]+)\/(.+)$/)
  if (!match) return false
  const [, projectId, file] = match
  if (!projectExists(projectId)) return false
  const resolved = resolveFrameFile(projectId, file)
  if (!resolved) return false
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false
  const ext = path.extname(resolved).toLowerCase()
  const type = ext === '.html' ? 'text/html'
    : ext === '.css' ? 'text/css'
    : ext === '.js' ? 'application/javascript'
    : ext === '.json' ? 'application/json'
    : ext === '.svg' ? 'image/svg+xml'
    : ext === '.md' ? 'text/markdown; charset=utf-8'
    : 'application/octet-stream'
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'no-cache')
  fs.createReadStream(resolved).pipe(res)
  return true
}

export { projectDir }
