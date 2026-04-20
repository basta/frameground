import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createProject } from './projects.ts'
import {
  readManifest,
  writeManifest,
  appendFrame,
  patchFrame,
  removeFrame,
} from './manifest.ts'

let tmp: string
let prevRoot: string | undefined

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-manifest-'))
  prevRoot = process.env.PROJECTS_ROOT
  process.env.PROJECTS_ROOT = tmp
  createProject('demo')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevRoot === undefined) delete process.env.PROJECTS_ROOT
  else process.env.PROJECTS_ROOT = prevRoot
})

describe('readManifest', () => {
  test('returns empty manifest when file missing', () => {
    fs.unlinkSync(path.join(tmp, 'demo', 'frames.json'))
    expect(readManifest('demo')).toEqual({ frames: [] })
  })

  test('returns empty manifest when JSON is corrupt', () => {
    fs.writeFileSync(path.join(tmp, 'demo', 'frames.json'), 'not json {{{')
    expect(readManifest('demo')).toEqual({ frames: [] })
  })

  test('returns empty manifest when shape is wrong', () => {
    fs.writeFileSync(path.join(tmp, 'demo', 'frames.json'), JSON.stringify({ foo: 'bar' }))
    expect(readManifest('demo')).toEqual({ frames: [] })
  })

  test('reads valid manifest', () => {
    fs.writeFileSync(
      path.join(tmp, 'demo', 'frames.json'),
      JSON.stringify({ frames: [{ id: 'a', name: 'A', file: 'a.html' }] }),
    )
    expect(readManifest('demo')).toEqual({ frames: [{ id: 'a', name: 'A', file: 'a.html' }] })
  })
})

describe('writeManifest', () => {
  test('writes atomically — no .tmp leftover on success', () => {
    writeManifest('demo', { frames: [{ id: 'a', name: 'A', file: 'a.html' }] })
    const files = fs.readdirSync(path.join(tmp, 'demo'))
    expect(files).not.toContain('frames.json.tmp')
    expect(files).toContain('frames.json')
  })
})

describe('appendFrame', () => {
  test('appends to empty manifest', () => {
    appendFrame('demo', { id: 'a', name: 'A', file: 'a.html' })
    expect(readManifest('demo').frames).toEqual([{ id: 'a', name: 'A', file: 'a.html' }])
  })

  test('appends to populated manifest', () => {
    appendFrame('demo', { id: 'a', name: 'A', file: 'a.html' })
    appendFrame('demo', { id: 'b', name: 'B', file: 'b.html' })
    expect(readManifest('demo').frames.map(f => f.id)).toEqual(['a', 'b'])
  })

  test('throws on duplicate id', () => {
    appendFrame('demo', { id: 'a', name: 'A', file: 'a.html' })
    expect(() => appendFrame('demo', { id: 'a', name: 'A2', file: 'a2.html' })).toThrow(/already exists/)
  })
})

describe('patchFrame', () => {
  beforeEach(() => {
    appendFrame('demo', { id: 'a', name: 'A', file: 'a.html' })
  })

  test('updates name', () => {
    const updated = patchFrame('demo', 'a', { name: 'Renamed' })
    expect(updated).toEqual({ id: 'a', name: 'Renamed', file: 'a.html' })
    expect(readManifest('demo').frames[0].name).toBe('Renamed')
  })

  test('updates file', () => {
    patchFrame('demo', 'a', { file: 'new.html' })
    expect(readManifest('demo').frames[0].file).toBe('new.html')
  })

  test('returns null for missing frame', () => {
    expect(patchFrame('demo', 'missing', { name: 'x' })).toBeNull()
  })

  test('leaves other fields intact', () => {
    patchFrame('demo', 'a', { name: 'Renamed' })
    expect(readManifest('demo').frames[0].file).toBe('a.html')
  })
})

describe('removeFrame', () => {
  beforeEach(() => {
    appendFrame('demo', { id: 'a', name: 'A', file: 'a.html' })
    appendFrame('demo', { id: 'b', name: 'B', file: 'b.html' })
  })

  test('removes frame and returns it', () => {
    const removed = removeFrame('demo', 'a')
    expect(removed).toEqual({ id: 'a', name: 'A', file: 'a.html' })
    expect(readManifest('demo').frames.map(f => f.id)).toEqual(['b'])
  })

  test('returns null for missing frame', () => {
    expect(removeFrame('demo', 'missing')).toBeNull()
    expect(readManifest('demo').frames).toHaveLength(2)
  })
})
