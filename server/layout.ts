import fs from 'fs'
import path from 'path'
import { projectDir } from './projects.ts'
import type { Layout, LayoutEntry } from './types.ts'

function layoutPath(projectId: string): string {
  return path.join(projectDir(projectId), '.opendesign', 'layout.json')
}

function writeAtomic(filePath: string, data: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, filePath)
}

export function readLayout(projectId: string): Layout {
  const p = layoutPath(projectId)
  if (!fs.existsSync(p)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return (parsed && typeof parsed === 'object') ? parsed : {}
  } catch {
    return {}
  }
}

export function writeLayout(projectId: string, layout: Layout): void {
  writeAtomic(layoutPath(projectId), JSON.stringify(layout, null, 2))
}

export function patchLayoutEntry(projectId: string, frameId: string, patch: Partial<LayoutEntry>): LayoutEntry {
  const layout = readLayout(projectId)
  const current: LayoutEntry = layout[frameId] ?? { x: 200, y: 200, w: 800, h: 600 }
  const next: LayoutEntry = { ...current, ...patch }
  layout[frameId] = next
  writeLayout(projectId, layout)
  return next
}

export function removeLayoutEntry(projectId: string, frameId: string): void {
  const layout = readLayout(projectId)
  if (frameId in layout) {
    delete layout[frameId]
    writeLayout(projectId, layout)
  }
}
