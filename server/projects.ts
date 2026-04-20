import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const PROJECT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

const DESIGN_REFERENCE = {
  id: 'design-reference',
  name: 'Design reference',
  file: 'design-reference.html',
  layout: { x: 200, y: 200, w: 1200, h: 900 },
}

const DESIGN_REFERENCE_HTML = fs.readFileSync(
  fileURLToPath(new URL('./templates/design-reference.html', import.meta.url)),
  'utf-8',
)

const PROJECT_MD_TEMPLATE = `# Project

TODO: one-paragraph description of what this project is.

## Concept

TODO

## Frames

- **Design reference** — live view of the project's design language (from DESIGN.md).
`

const DESIGN_MD_TEMPLATE = `# Design Language

TODO: the committed aesthetic direction for this project. Every frame must follow it.
Frames are built via the \`frontend-design\` skill — its guidance defines what goes
in each section below. The first frame in this project commits these choices.

## Aesthetic Direction

TODO: one bold, specific tone (e.g. brutalist/raw, editorial/magazine, retro-futuristic,
organic/natural, luxury/refined, maximalist chaos). No hedging — pick one.

## Typography

TODO: a distinctive display font + a refined body font. Not Inter, Roboto, Arial, or system fonts.

## Color & Theme

TODO: dominant color(s) + sharp accents. Light or dark theme. CSS variables preferred.

## Motion

TODO: motion language — entrance choreography, hover behavior, scroll interactions.

## Spatial Composition

TODO: grid vs. asymmetry, density vs. negative space, overlap/diagonal flow rules.

## Backgrounds & Textures

TODO: atmospheric treatment — gradient meshes, noise, grain, patterns, shadows, etc.

## Components

TODO: reusable component patterns as they emerge (buttons, cards, inputs, nav).
`

export function projectsRoot(): string {
  return path.resolve(process.env.PROJECTS_ROOT || 'projects')
}

export function ensureRoot(): string {
  const root = projectsRoot()
  fs.mkdirSync(root, { recursive: true })
  return root
}

export function validProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id)
}

export function projectDir(id: string): string {
  if (!validProjectId(id)) throw new Error(`Invalid project id: ${id}`)
  return path.join(projectsRoot(), id)
}

export function projectExists(id: string): boolean {
  if (!validProjectId(id)) return false
  const dir = projectDir(id)
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory()
}

export function listProjects(): string[] {
  const root = ensureRoot()
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory() && validProjectId(e.name))
    .map(e => e.name)
    .sort()
}

export function createProject(id: string): void {
  if (!validProjectId(id)) throw new Error(`Invalid project id: ${id}`)
  const dir = projectDir(id)
  if (fs.existsSync(dir)) throw new Error(`Project already exists: ${id}`)
  fs.mkdirSync(path.join(dir, '.opendesign'), { recursive: true })
  const manifest = {
    frames: [{ id: DESIGN_REFERENCE.id, name: DESIGN_REFERENCE.name, file: DESIGN_REFERENCE.file }],
  }
  const layout = { [DESIGN_REFERENCE.id]: DESIGN_REFERENCE.layout }
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(dir, '.opendesign', 'layout.json'), JSON.stringify(layout, null, 2))
  fs.writeFileSync(path.join(dir, 'PROJECT.md'), PROJECT_MD_TEMPLATE)
  fs.writeFileSync(path.join(dir, 'DESIGN.md'), DESIGN_MD_TEMPLATE)
  fs.writeFileSync(path.join(dir, DESIGN_REFERENCE.file), DESIGN_REFERENCE_HTML)
}

export function resolveFrameFile(projectId: string, file: string): string | null {
  const dir = projectDir(projectId)
  const resolved = path.resolve(dir, file)
  if (!resolved.startsWith(dir + path.sep)) return null
  return resolved
}
