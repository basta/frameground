import fs from 'fs'
import path from 'path'
import { projectDir } from './projects.ts'

export interface SuggestionVariant {
  name: string
  description?: string
  tokens: Record<string, unknown>
}

export interface Suggestion {
  id: string
  tweak: string
  createdAt?: string
  prompt?: string
  source?: string
  variants: SuggestionVariant[]
}

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/

export function suggestionsDir(projectId: string): string {
  return path.join(projectDir(projectId), '.opendesign', 'suggestions')
}

export function isValidSuggestionId(id: string): boolean {
  return ID_RE.test(id)
}

export function listSuggestions(projectId: string): Suggestion[] {
  const dir = suggestionsDir(projectId)
  if (!fs.existsSync(dir)) return []
  const out: Suggestion[] = []
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue
    const id = entry.slice(0, -5)
    if (!isValidSuggestionId(id)) continue
    const file = path.join(dir, entry)
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
      const s = normalize(id, parsed)
      if (s) out.push(s)
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => (a.createdAt ?? a.id).localeCompare(b.createdAt ?? b.id))
  return out
}

export function removeSuggestion(projectId: string, id: string): boolean {
  if (!isValidSuggestionId(id)) return false
  const file = path.join(suggestionsDir(projectId), `${id}.json`)
  if (!fs.existsSync(file)) return false
  fs.unlinkSync(file)
  return true
}

function normalize(id: string, raw: unknown): Suggestion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const tweak = typeof obj.tweak === 'string' ? obj.tweak : null
  const variantsRaw = Array.isArray(obj.variants) ? obj.variants : null
  if (!tweak || !variantsRaw) return null
  const variants: SuggestionVariant[] = []
  for (const v of variantsRaw) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const vo = v as Record<string, unknown>
    const name = typeof vo.name === 'string' ? vo.name : null
    const tokens = vo.tokens && typeof vo.tokens === 'object' && !Array.isArray(vo.tokens)
      ? (vo.tokens as Record<string, unknown>) : null
    if (!name || !tokens) continue
    const variant: SuggestionVariant = { name, tokens }
    if (typeof vo.description === 'string') variant.description = vo.description
    variants.push(variant)
  }
  if (variants.length === 0) return null
  const out: Suggestion = { id, tweak, variants }
  if (typeof obj.createdAt === 'string') out.createdAt = obj.createdAt
  if (typeof obj.prompt === 'string') out.prompt = obj.prompt
  if (typeof obj.source === 'string') out.source = obj.source
  return out
}
