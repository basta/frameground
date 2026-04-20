import fs from 'fs'
import path from 'path'
import { projectDir } from './projects.ts'
import type { FrameEntry, Manifest } from './types.ts'

function manifestPath(projectId: string): string {
  return path.join(projectDir(projectId), 'frames.json')
}

function writeAtomic(filePath: string, data: string): void {
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, filePath)
}

export function readManifest(projectId: string): Manifest {
  const p = manifestPath(projectId)
  if (!fs.existsSync(p)) return { frames: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (Array.isArray(parsed?.frames)) return parsed
    return { frames: [] }
  } catch {
    return { frames: [] }
  }
}

export function writeManifest(projectId: string, manifest: Manifest): void {
  writeAtomic(manifestPath(projectId), JSON.stringify(manifest, null, 2))
}

export function appendFrame(projectId: string, entry: FrameEntry): void {
  const m = readManifest(projectId)
  if (m.frames.some(f => f.id === entry.id)) {
    throw new Error(`Frame id already exists: ${entry.id}`)
  }
  m.frames.push(entry)
  writeManifest(projectId, m)
}

export function patchFrame(projectId: string, frameId: string, patch: Partial<Omit<FrameEntry, 'id'>>): FrameEntry | null {
  const m = readManifest(projectId)
  const idx = m.frames.findIndex(f => f.id === frameId)
  if (idx === -1) return null
  m.frames[idx] = { ...m.frames[idx], ...patch }
  writeManifest(projectId, m)
  return m.frames[idx]
}

export function removeFrame(projectId: string, frameId: string): FrameEntry | null {
  const m = readManifest(projectId)
  const idx = m.frames.findIndex(f => f.id === frameId)
  if (idx === -1) return null
  const [removed] = m.frames.splice(idx, 1)
  writeManifest(projectId, m)
  return removed
}
