import path from 'path'
import fs from 'fs'

const PROJECT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

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
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ frames: [] }, null, 2))
  fs.writeFileSync(path.join(dir, '.opendesign', 'layout.json'), JSON.stringify({}, null, 2))
}

export function resolveFrameFile(projectId: string, file: string): string | null {
  const dir = projectDir(projectId)
  const resolved = path.resolve(dir, file)
  if (!resolved.startsWith(dir + path.sep)) return null
  return resolved
}
