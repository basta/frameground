import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createProject } from './projects.ts'
import {
  readLayout,
  writeLayout,
  patchLayoutEntry,
  removeLayoutEntry,
} from './layout.ts'

let tmp: string
let prevRoot: string | undefined

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-layout-'))
  prevRoot = process.env.PROJECTS_ROOT
  process.env.PROJECTS_ROOT = tmp
  createProject('demo')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevRoot === undefined) delete process.env.PROJECTS_ROOT
  else process.env.PROJECTS_ROOT = prevRoot
})

describe('readLayout', () => {
  test('returns empty when file missing', () => {
    fs.rmSync(path.join(tmp, 'demo', '.opendesign'), { recursive: true, force: true })
    expect(readLayout('demo')).toEqual({})
  })

  test('returns empty when JSON is corrupt', () => {
    fs.writeFileSync(path.join(tmp, 'demo', '.opendesign', 'layout.json'), 'not json {')
    expect(readLayout('demo')).toEqual({})
  })

  test('reads valid layout', () => {
    writeLayout('demo', { a: { x: 100, y: 200, w: 400, h: 300 } })
    expect(readLayout('demo')).toEqual({ a: { x: 100, y: 200, w: 400, h: 300 } })
  })
})

describe('writeLayout', () => {
  test('creates .opendesign directory if missing', () => {
    fs.rmSync(path.join(tmp, 'demo', '.opendesign'), { recursive: true, force: true })
    writeLayout('demo', { a: { x: 1, y: 2, w: 3, h: 4 } })
    expect(fs.existsSync(path.join(tmp, 'demo', '.opendesign', 'layout.json'))).toBe(true)
  })

  test('no .tmp leftover', () => {
    writeLayout('demo', { a: { x: 1, y: 2, w: 3, h: 4 } })
    const files = fs.readdirSync(path.join(tmp, 'demo', '.opendesign'))
    expect(files).not.toContain('layout.json.tmp')
    expect(files).toContain('layout.json')
  })
})

describe('patchLayoutEntry', () => {
  test('creates new entry with defaults for missing fields', () => {
    const result = patchLayoutEntry('demo', 'a', { x: 500 })
    expect(result.x).toBe(500)
    expect(result).toHaveProperty('y')
    expect(result).toHaveProperty('w')
    expect(result).toHaveProperty('h')
  })

  test('patches existing entry partially, keeping other fields', () => {
    writeLayout('demo', { a: { x: 100, y: 200, w: 400, h: 300 } })
    const result = patchLayoutEntry('demo', 'a', { x: 500 })
    expect(result).toEqual({ x: 500, y: 200, w: 400, h: 300 })
  })

  test('persists to disk', () => {
    patchLayoutEntry('demo', 'a', { x: 1, y: 2, w: 3, h: 4 })
    expect(readLayout('demo').a).toEqual({ x: 1, y: 2, w: 3, h: 4 })
  })

  test('independent entries do not interfere', () => {
    patchLayoutEntry('demo', 'a', { x: 1, y: 1, w: 100, h: 100 })
    patchLayoutEntry('demo', 'b', { x: 2, y: 2, w: 200, h: 200 })
    const layout = readLayout('demo')
    expect(layout.a).toEqual({ x: 1, y: 1, w: 100, h: 100 })
    expect(layout.b).toEqual({ x: 2, y: 2, w: 200, h: 200 })
  })
})

describe('removeLayoutEntry', () => {
  test('removes an existing entry', () => {
    patchLayoutEntry('demo', 'a', { x: 1, y: 2, w: 3, h: 4 })
    removeLayoutEntry('demo', 'a')
    expect(readLayout('demo')).toEqual({})
  })

  test('is a no-op when entry does not exist', () => {
    patchLayoutEntry('demo', 'a', { x: 1, y: 2, w: 3, h: 4 })
    removeLayoutEntry('demo', 'missing')
    expect(Object.keys(readLayout('demo'))).toEqual(['a'])
  })

  test('leaves other entries intact', () => {
    patchLayoutEntry('demo', 'a', { x: 1, y: 1, w: 100, h: 100 })
    patchLayoutEntry('demo', 'b', { x: 2, y: 2, w: 200, h: 200 })
    removeLayoutEntry('demo', 'a')
    expect(Object.keys(readLayout('demo'))).toEqual(['b'])
  })
})
