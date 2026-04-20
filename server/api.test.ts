import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import type { AddressInfo } from 'net'
import { handleApi, handleFrames } from './api.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(res: Response): Promise<any> {
  return await res.json()
}

let server: http.Server
let baseUrl: string

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = req.url ?? ''
    if (url.startsWith('/api/')) {
      await handleApi(req, res)
      return
    }
    if (url.startsWith('/frames/')) {
      if (handleFrames(req, res)) return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  )
})

let tmp: string
let prevRoot: string | undefined

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-api-'))
  prevRoot = process.env.PROJECTS_ROOT
  process.env.PROJECTS_ROOT = tmp
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevRoot === undefined) delete process.env.PROJECTS_ROOT
  else process.env.PROJECTS_ROOT = prevRoot
})

async function createDemo() {
  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'demo' }),
  })
  expect(res.status).toBe(201)
}

describe('GET /api/workspace', () => {
  test('returns root path and project list', async () => {
    await createDemo()
    const res = await fetch(`${baseUrl}/api/workspace`)
    expect(res.status).toBe(200)
    const body = await getJson(res)
    expect(body.root).toBe(path.resolve(tmp))
    expect(body.projects).toEqual([{ id: 'demo', path: path.join(path.resolve(tmp), 'demo') }])
  })

  test('returns empty projects when none exist', async () => {
    const res = await fetch(`${baseUrl}/api/workspace`)
    const body = await getJson(res)
    expect(body.projects).toEqual([])
  })
})

describe('GET /api/projects', () => {
  test('returns empty list initially', async () => {
    const res = await fetch(`${baseUrl}/api/projects`)
    expect(res.status).toBe(200)
    expect(await getJson(res)).toEqual({ projects: [] })
  })

  test('returns created projects', async () => {
    await createDemo()
    const res = await fetch(`${baseUrl}/api/projects`)
    expect((await getJson(res)).projects).toEqual(['demo'])
  })
})

describe('POST /api/projects', () => {
  test('creates project and returns id', async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'new-proj' }),
    })
    expect(res.status).toBe(201)
    expect(await getJson(res)).toEqual({ id: 'new-proj' })
    expect(fs.existsSync(path.join(tmp, 'new-proj', 'frames.json'))).toBe(true)
  })

  test('rejects invalid name', async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '../evil' }),
    })
    expect(res.status).toBe(400)
  })

  test('rejects duplicate', async () => {
    await createDemo()
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'demo' }),
    })
    expect(res.status).toBe(409)
  })
})

describe('manifest + layout GET', () => {
  beforeEach(createDemo)

  test('GET manifest returns empty frames', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/manifest`)
    expect(res.status).toBe(200)
    expect(await getJson(res)).toEqual({ frames: [] })
  })

  test('GET layout returns empty object', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/layout`)
    expect(res.status).toBe(200)
    expect(await getJson(res)).toEqual({})
  })

  test('GET manifest 404s on missing project', async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/manifest`)
    expect(res.status).toBe(404)
  })

  test('GET layout 404s on missing project', async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/layout`)
    expect(res.status).toBe(404)
  })
})

describe('POST /api/projects/:id/frames', () => {
  beforeEach(createDemo)

  test('creates full frame: manifest + layout + html', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'hello', name: 'Hello', file: 'hello.html',
        html: '<h1>hi</h1>', x: 100, y: 200, w: 400, h: 300,
      }),
    })
    expect(res.status).toBe(201)
    const body = await getJson(res)
    expect(body.frame).toEqual({ id: 'hello', name: 'Hello', file: 'hello.html' })
    expect(body.layout).toEqual({ x: 100, y: 200, w: 400, h: 300 })

    const manifestRes = await fetch(`${baseUrl}/api/projects/demo/manifest`)
    expect((await getJson(manifestRes)).frames).toEqual([{ id: 'hello', name: 'Hello', file: 'hello.html' }])

    const layoutRes = await fetch(`${baseUrl}/api/projects/demo/layout`)
    expect((await getJson(layoutRes)).hello).toEqual({ x: 100, y: 200, w: 400, h: 300 })

    expect(fs.readFileSync(path.join(tmp, 'demo', 'hello.html'), 'utf-8')).toBe('<h1>hi</h1>')
  })

  test('rejects invalid frame id', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '../evil', name: 'X', file: 'x.html' }),
    })
    expect(res.status).toBe(400)
  })

  test('rejects path traversal in file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'x', name: 'X', file: '../escape.html', html: 'x' }),
    })
    expect(res.status).toBe(400)
  })

  test('rejects duplicate frame id', async () => {
    await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'a', name: 'A', file: 'a.html', html: 'x' }),
    })
    const res = await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'a', name: 'A2', file: 'a2.html', html: 'y' }),
    })
    expect(res.status).toBe(409)
  })

  test('requires name and file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'x' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/projects/:id/frames/:frameId', () => {
  beforeEach(async () => {
    await createDemo()
    await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'a', name: 'A', file: 'a.html', html: 'x' }),
    })
  })

  test('renames frame', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames/a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    })
    expect(res.status).toBe(200)
    expect(await getJson(res)).toEqual({ id: 'a', name: 'Renamed', file: 'a.html' })
  })

  test('404s on missing frame', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames/missing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(res.status).toBe(404)
  })

  test('rejects file path traversal', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames/a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: '../evil.html' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/projects/:id/frames/:frameId', () => {
  beforeEach(async () => {
    await createDemo()
    await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'a', name: 'A', file: 'a.html', html: 'x',
        x: 1, y: 2, w: 3, h: 4,
      }),
    })
  })

  test('removes from manifest and layout, keeps file by default', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames/a`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const manifest = await getJson(await fetch(`${baseUrl}/api/projects/demo/manifest`))
    const layout = await getJson(await fetch(`${baseUrl}/api/projects/demo/layout`))
    expect(manifest.frames).toEqual([])
    expect(layout).toEqual({})
    expect(fs.existsSync(path.join(tmp, 'demo', 'a.html'))).toBe(true)
  })

  test('deletes file with ?deleteFile=true', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames/a?deleteFile=true`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(fs.existsSync(path.join(tmp, 'demo', 'a.html'))).toBe(false)
  })

  test('404s on missing frame', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/frames/missing`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/projects/:id/layout/:frameId', () => {
  beforeEach(createDemo)

  test('creates layout entry if missing, merging defaults', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/layout/new`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 500 }),
    })
    expect(res.status).toBe(200)
    const body = await getJson(res)
    expect(body.x).toBe(500)
    expect(body).toHaveProperty('y')
  })

  test('patches existing entry partially', async () => {
    await fetch(`${baseUrl}/api/projects/demo/layout/a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 1, y: 2, w: 3, h: 4 }),
    })
    const res = await fetch(`${baseUrl}/api/projects/demo/layout/a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 500 }),
    })
    expect(await getJson(res)).toEqual({ x: 500, y: 2, w: 3, h: 4 })
  })

  test('ignores non-numeric values', async () => {
    const res = await fetch(`${baseUrl}/api/projects/demo/layout/a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 'not a number' }),
    })
    expect(res.status).toBe(200)
  })
})

describe('GET /frames/:projectId/:file', () => {
  beforeEach(async () => {
    await createDemo()
    await fetch(`${baseUrl}/api/projects/demo/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'a', name: 'A', file: 'a.html', html: '<h1>served</h1>' }),
    })
  })

  test('serves the html file', async () => {
    const res = await fetch(`${baseUrl}/frames/demo/a.html`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(await res.text()).toBe('<h1>served</h1>')
  })

  test('404s for nonexistent project', async () => {
    const res = await fetch(`${baseUrl}/frames/nonexistent/a.html`)
    expect(res.status).toBe(404)
  })

  test('404s for nonexistent file', async () => {
    const res = await fetch(`${baseUrl}/frames/demo/missing.html`)
    expect(res.status).toBe(404)
  })

  test('blocks path traversal', async () => {
    const res = await fetch(`${baseUrl}/frames/demo/..%2F..%2Fetc%2Fpasswd`)
    expect(res.status).toBe(404)
  })
})
