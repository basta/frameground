import fs from 'fs'
import path from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
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

const META_KEYS = new Set(['version', 'name', 'description'])

export function tokensToCss(tokens: Record<string, unknown>, parseError?: string): string {
  const head: string[] = []
  if (parseError) head.push(`/* parseError: ${parseError.replace(/\*\//g, '*\\/')} */`)

  const decls: string[] = []
  const skipped: string[] = []

  for (const key of Object.keys(tokens)) {
    if (META_KEYS.has(key)) continue
    const val = tokens[key]
    const cssKey = toCssName(key)
    if (!cssKey) { skipped.push(key); continue }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flattenInto(val as Record<string, unknown>, cssKey, decls, skipped)
    } else {
      const css = cssValue(val)
      if (css === null) skipped.push(key)
      else decls.push(`  --${cssKey}: ${css};`)
    }
  }

  const out: string[] = [...head, ':root {']
  if (decls.length) out.push(decls.join('\n'))
  out.push('}')
  for (const s of skipped) out.push(`/* skipped: ${s} */`)
  return out.join('\n') + '\n'
}

function toCssName(s: string): string | null {
  const kebab = String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  return /^[a-z0-9_-]+$/.test(kebab) ? kebab : null
}

const REF_RE = /^\{([a-zA-Z0-9_.-]+)\}$/

function resolveRef(s: string): string {
  const m = s.match(REF_RE)
  if (!m) return s
  const parts = m[1].split('.').map(toCssName)
  if (parts.some(p => p === null)) return s
  return `var(--${(parts as string[]).join('-')})`
}

function cssValue(v: unknown): string | null {
  if (typeof v === 'string') return resolveRef(v)
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (Array.isArray(v)) {
    const parts = v.map(x =>
      typeof x === 'string' ? resolveRef(x) : typeof x === 'number' && Number.isFinite(x) ? String(x) : null,
    )
    if (parts.every(p => p !== null)) return parts.join(', ')
  }
  return null
}

function flattenInto(
  obj: Record<string, unknown>,
  prefix: string,
  decls: string[],
  skipped: string[],
): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    const cssKey = toCssName(key)
    const pathLabel = `${prefix}.${key}`
    if (!cssKey) { skipped.push(pathLabel); continue }
    const name = `${prefix}-${cssKey}`
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flattenInto(val as Record<string, unknown>, name, decls, skipped)
    } else {
      const css = cssValue(val)
      if (css === null) skipped.push(name)
      else decls.push(`  --${name}: ${css};`)
    }
  }
}

function mergeDeep(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(patch)) {
    const pv = patch[key]
    const bv = out[key]
    if (
      pv && typeof pv === 'object' && !Array.isArray(pv) &&
      bv && typeof bv === 'object' && !Array.isArray(bv)
    ) {
      out[key] = mergeDeep(bv as Record<string, unknown>, pv as Record<string, unknown>)
    } else {
      out[key] = pv
    }
  }
  return out
}

export function writeDesignTokens(projectId: string, patch: Record<string, unknown>): void {
  const file = path.join(projectDir(projectId), 'DESIGN.md')
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''
  const m = raw.match(FRONT_MATTER_RE)
  let currentTokens: Record<string, unknown> = {}
  let body = raw
  if (m) {
    try {
      const parsed = parseYaml(m[1])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        currentTokens = parsed as Record<string, unknown>
      }
    } catch {
      // If the current front-matter is unparseable, replace it rather than drop data silently.
    }
    body = raw.slice(m[0].length)
  }
  const next = mergeDeep(currentTokens, patch)
  const yamlOut = stringifyYaml(next).replace(/\n$/, '')
  const composed = `---\n${yamlOut}\n---\n${body}`
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, composed)
  fs.renameSync(tmp, file)
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
