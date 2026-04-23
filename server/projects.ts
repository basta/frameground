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

const DESIGN_MD_TEMPLATE = `---
version: alpha
name: TODO
description: TODO one-line description of this project's aesthetic commitment.
colors: {}
typography: {}
rounded: {}
spacing: {}
components: {}
---

# Design Language

TODO: the committed aesthetic direction for this project. Every frame must follow it.
Frames are built via the \`frontend-design\` skill — it emits tokens (front-matter above)
plus the prose below. The first frame in this project commits these choices.

The structured tokens in this file are authoritative. Project-specific prose about
motion, spatial composition, and background/texture treatment lives in FEEL.md.

## Overview

TODO: one bold, specific tone (e.g. brutalist/raw, editorial/magazine, retro-futuristic,
organic/natural, luxury/refined, maximalist chaos). No hedging — pick one.

## Colors

TODO: describe the palette intent. Hex values live in the \`colors\` front-matter.

## Typography

TODO: describe the type pairing intent (distinctive display + refined body).
Not Inter, Roboto, Arial, or system fonts. Values live in the \`typography\` front-matter.

## Layout

TODO: spacing scale rationale. Values live in \`spacing\` front-matter.

## Elevation & Depth

TODO: how depth is expressed — shadows, rims, layered transparencies, or none.

## Shapes

TODO: corner radii intent. Values live in \`rounded\` front-matter.

## Components

TODO: reusable component patterns as they emerge. Structured values live in
\`components\` front-matter.

## Do's and Don'ts

TODO: short bullets of what the aesthetic requires and what it forbids.
`

const SHARED_CSS_TEMPLATE = `/* Project-level CSS shared across every frame.
   Add resets, @font-face declarations, and utility classes here.
   DESIGN.md tokens are exposed automatically as CSS variables
   (e.g. var(--colors-primary), var(--spacing-md)). */
`

const FEEL_MD_TEMPLATE = `# Feel

How this project moves, occupies space, and treats atmosphere. Frame implementations
must follow these rules alongside the tokens in DESIGN.md.

## Motion

TODO: motion language — entrance choreography, hover behavior, scroll interactions,
durations, easings.

## Spatial Composition

TODO: grid vs. asymmetry, density vs. negative space, overlap/diagonal flow rules.

## Backgrounds & Textures

TODO: atmospheric treatment — gradient meshes, noise, grain, patterns, shadows, etc.
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
  fs.writeFileSync(path.join(dir, 'FEEL.md'), FEEL_MD_TEMPLATE)
  fs.writeFileSync(path.join(dir, 'shared.css'), SHARED_CSS_TEMPLATE)
  fs.writeFileSync(path.join(dir, DESIGN_REFERENCE.file), DESIGN_REFERENCE_HTML)
}

export function resolveFrameFile(projectId: string, file: string): string | null {
  const dir = projectDir(projectId)
  const resolved = path.resolve(dir, file)
  if (!resolved.startsWith(dir + path.sep)) return null
  return resolved
}
