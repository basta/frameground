import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  validProjectId,
  projectsRoot,
  ensureRoot,
  projectDir,
  projectExists,
  listProjects,
  createProject,
  resolveFrameFile,
} from './projects.ts'

let tmp: string
let prevRoot: string | undefined

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-projects-'))
  prevRoot = process.env.PROJECTS_ROOT
  process.env.PROJECTS_ROOT = tmp
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevRoot === undefined) delete process.env.PROJECTS_ROOT
  else process.env.PROJECTS_ROOT = prevRoot
})

describe('validProjectId', () => {
  test.each([
    ['demo', true],
    ['my-app', true],
    ['my_app', true],
    ['App123', true],
    ['a', true],
    ['A'.repeat(64), true],
    ['A'.repeat(65), false],
    ['', false],
    ['-leading-dash', false],
    ['_leading-underscore', false],
    ['with space', false],
    ['with.dot', false],
    ['with/slash', false],
    ['../escape', false],
    ['a/b', false],
  ])('%s -> %s', (id, expected) => {
    expect(validProjectId(id)).toBe(expected)
  })
})

describe('projectsRoot / ensureRoot', () => {
  test('returns resolved absolute path from env', () => {
    expect(projectsRoot()).toBe(path.resolve(tmp))
  })

  test('ensureRoot creates the directory', () => {
    fs.rmSync(tmp, { recursive: true, force: true })
    expect(fs.existsSync(tmp)).toBe(false)
    ensureRoot()
    expect(fs.existsSync(tmp)).toBe(true)
  })
})

describe('createProject', () => {
  test('creates dir, frames.json, layout.json', () => {
    createProject('demo')
    const dir = path.join(tmp, 'demo')
    expect(fs.existsSync(dir)).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf-8'))).toEqual({ frames: [] })
    expect(JSON.parse(fs.readFileSync(path.join(dir, '.opendesign', 'layout.json'), 'utf-8'))).toEqual({})
  })

  test('throws on invalid id', () => {
    expect(() => createProject('../evil')).toThrow(/Invalid/)
    expect(() => createProject('')).toThrow(/Invalid/)
  })

  test('throws on duplicate', () => {
    createProject('demo')
    expect(() => createProject('demo')).toThrow(/already exists/)
  })
})

describe('projectExists / listProjects', () => {
  test('projectExists reflects filesystem', () => {
    expect(projectExists('demo')).toBe(false)
    createProject('demo')
    expect(projectExists('demo')).toBe(true)
  })

  test('projectExists rejects invalid ids without throwing', () => {
    expect(projectExists('../escape')).toBe(false)
  })

  test('listProjects returns sorted ids, ignoring files and invalid names', () => {
    createProject('zebra')
    createProject('apple')
    createProject('mango')
    fs.writeFileSync(path.join(tmp, 'stray-file.txt'), 'x')
    fs.mkdirSync(path.join(tmp, '.hidden'))
    expect(listProjects()).toEqual(['apple', 'mango', 'zebra'])
  })
})

describe('projectDir', () => {
  test('returns path under root', () => {
    expect(projectDir('demo')).toBe(path.join(path.resolve(tmp), 'demo'))
  })

  test('throws on invalid id', () => {
    expect(() => projectDir('../escape')).toThrow(/Invalid/)
  })
})

describe('resolveFrameFile', () => {
  beforeEach(() => createProject('demo'))

  test('resolves normal file path', () => {
    const r = resolveFrameFile('demo', 'login.html')
    expect(r).toBe(path.join(path.resolve(tmp), 'demo', 'login.html'))
  })

  test('blocks path traversal with ..', () => {
    expect(resolveFrameFile('demo', '../outside.html')).toBeNull()
    expect(resolveFrameFile('demo', '../../etc/passwd')).toBeNull()
  })

  test('blocks absolute paths outside project dir', () => {
    expect(resolveFrameFile('demo', '/etc/passwd')).toBeNull()
  })

  test('allows subdirectories', () => {
    const r = resolveFrameFile('demo', 'assets/img.png')
    expect(r).toBe(path.join(path.resolve(tmp), 'demo', 'assets', 'img.png'))
  })
})
