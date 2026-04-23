import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { projectDir } from './projects.ts'

export interface Section { title: string; body: string }
export interface DesignDoc {
  tokens: Record<string, unknown>
  body: string
  sections: Section[]
}
export interface FeelDoc {
  body: string
  sections: Section[]
}
export interface ProjectDesign {
  design: DesignDoc
  feel: FeelDoc | null
  parseError?: string
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function readProjectDesign(projectId: string): ProjectDesign {
  const dir = projectDir(projectId)
  const { tokens, body, parseError } = readDesignFile(path.join(dir, 'DESIGN.md'))
  const feelPath = path.join(dir, 'FEEL.md')
  const feelRaw = fs.existsSync(feelPath) ? fs.readFileSync(feelPath, 'utf-8') : null
  const feel = feelRaw === null ? null : { body: feelRaw, sections: splitSections(feelRaw) }
  return {
    design: { tokens, body, sections: splitSections(body) },
    feel,
    parseError,
  }
}

function readDesignFile(file: string): { tokens: Record<string, unknown>; body: string; parseError?: string } {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''
  const m = raw.match(FRONT_MATTER_RE)
  let tokens: Record<string, unknown> = {}
  let body = raw
  let parseError: string | undefined
  if (m) {
    try {
      const parsed = parseYaml(m[1])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        tokens = parsed as Record<string, unknown>
      }
    } catch (e) {
      parseError = (e as Error).message
    }
    body = raw.slice(m[0].length)
  }
  return { tokens, body, parseError }
}

function splitSections(body: string): Section[] {
  const out: Section[] = []
  const lines = body.split(/\r?\n/)
  let title: string | null = null
  let buf: string[] = []
  for (const line of lines) {
    const h = line.match(/^## (.+)$/)
    if (h) {
      if (title !== null) out.push({ title, body: buf.join('\n').trim() })
      title = h[1].trim()
      buf = []
    } else if (title !== null) {
      buf.push(line)
    }
  }
  if (title !== null) out.push({ title, body: buf.join('\n').trim() })
  return out
}
