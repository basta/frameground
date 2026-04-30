import { spawn, type ChildProcess } from 'child_process'
import { Readable, Writable, Transform } from 'stream'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ServerResponse } from 'http'
import * as acp from '@agentclientprotocol/sdk'
import { projectDir, projectExists, resolveProjectPath } from './projects.ts'

// TODO(multi-agent): replace with env-var or per-project config so users can
// pick Claude Code, Gemini CLI, Codex, etc. The adapter is a project
// dependency so npx finds it in local node_modules without re-installing
// (avoiding the ETXTBSY race that `npx -y` triggers across concurrent spawns).
const AGENT_CMD: [string, string[]] = ['npx', ['claude-agent-acp']]

const LOG_LIMIT = 200

// Debug logging for the ACP integration. Set DEBUG_ACP=0 to silence.
// Frame-level logging (raw ndjson in/out) is gated separately on DEBUG_ACP=frames
// because it can be very noisy when models stream long responses.
const DEBUG_ACP = process.env.DEBUG_ACP !== '0'
const DEBUG_ACP_FRAMES = process.env.DEBUG_ACP === 'frames' || process.env.DEBUG_ACP_FRAMES === '1'

function dbg(projectId: string, msg: string, extra?: unknown): void {
  if (!DEBUG_ACP) return
  const prefix = `[acp:${projectId}]`
  if (extra !== undefined) console.log(prefix, msg, extra)
  else console.log(prefix, msg)
}

if (DEBUG_ACP) {
  console.log(`[acp] module loaded (DEBUG_ACP=${process.env.DEBUG_ACP ?? 'unset, default on'} frames=${DEBUG_ACP_FRAMES})`)
}

function truncate(s: string, max = 600): string {
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max})` : s
}

function makeLineSink(emit: (line: string) => void): (chunk: Buffer | string) => void {
  let buf = ''
  return chunk => {
    buf += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) emit(line)
    }
  }
}

type PermissionOutcome = acp.RequestPermissionResponse['outcome']

type ServerEvent =
  | { type: 'user_message'; text: string; ts: number }
  | { type: 'session_update'; update: acp.SessionUpdate; ts: number }
  | {
      type: 'permission_request'
      requestId: string
      toolCall: acp.ToolCallUpdate
      options: acp.PermissionOption[]
      ts: number
    }
  | { type: 'permission_resolved'; requestId: string; ts: number }
  | { type: 'turn_ended'; stopReason: string; ts: number }
  | { type: 'agent_error'; message: string; ts: number }
  | { type: 'agent_exited'; code: number | null; ts: number }
  | { type: 'chat_reset'; ts: number }

type Channel = {
  subs: Set<ServerResponse>
  log: ServerEvent[]
  session: AcpSession | null
  spawning: Promise<AcpSession> | null
}

type AcpSession = {
  child: ChildProcess
  conn: acp.ClientSideConnection
  sessionId: string
  pending: Map<string, (outcome: PermissionOutcome) => void>
}

const channels = new Map<string, Channel>()

function now(): number {
  return Date.now()
}

function getChannel(projectId: string): Channel {
  let ch = channels.get(projectId)
  if (!ch) {
    ch = { subs: new Set(), log: [], session: null, spawning: null }
    channels.set(projectId, ch)
  }
  return ch
}

function pushEvent(channel: Channel, event: ServerEvent): void {
  channel.log.push(event)
  if (channel.log.length > LOG_LIMIT) {
    channel.log.splice(0, channel.log.length - LOG_LIMIT)
  }
  const payload = `data: ${JSON.stringify(event)}\n\n`
  if (DEBUG_ACP) console.log(`[acp] pushEvent ${event.type} subs=${channel.subs.size}`)
  for (const res of channel.subs) {
    try {
      res.write(payload)
    } catch {
      channel.subs.delete(res)
    }
  }
}

function buildClient(channel: Channel, projectId: string): acp.Client {
  return {
    async readTextFile(params) {
      const session = channel.session
      if (!session || params.sessionId !== session.sessionId) {
        throw new Error('Unknown session')
      }
      const resolved = resolveProjectPath(projectId, params.path)
      if (!resolved) throw new Error(`Path outside project: ${params.path}`)
      let content = await fs.promises.readFile(resolved, 'utf-8')
      if (params.line !== undefined && params.line !== null) {
        const lines = content.split('\n')
        const start = Math.max(0, params.line - 1)
        const end = params.limit !== undefined && params.limit !== null
          ? start + params.limit
          : undefined
        content = lines.slice(start, end).join('\n')
      } else if (params.limit !== undefined && params.limit !== null) {
        content = content.split('\n').slice(0, params.limit).join('\n')
      }
      return { content }
    },
    async writeTextFile(params) {
      const session = channel.session
      if (!session || params.sessionId !== session.sessionId) {
        throw new Error('Unknown session')
      }
      const resolved = resolveProjectPath(projectId, params.path)
      if (!resolved) throw new Error(`Path outside project: ${params.path}`)
      const dir = path.dirname(resolved)
      if (dir) await fs.promises.mkdir(dir, { recursive: true })
      const tmp = resolved + '.tmp'
      await fs.promises.writeFile(tmp, params.content)
      await fs.promises.rename(tmp, resolved)
      return {}
    },
    async sessionUpdate(params) {
      dbg(projectId, `sessionUpdate ${params.update.sessionUpdate}`)
      pushEvent(channel, { type: 'session_update', update: params.update, ts: now() })
    },
    async requestPermission(params) {
      const session = channel.session
      if (!session) {
        dbg(projectId, `requestPermission rejected (no session)`)
        return { outcome: { outcome: 'cancelled' } }
      }
      const requestId = randomUUID()
      dbg(projectId, `requestPermission tool=${params.toolCall.toolCallId} options=${params.options.length}`)
      pushEvent(channel, {
        type: 'permission_request',
        requestId,
        toolCall: params.toolCall,
        options: params.options,
        ts: now(),
      })
      return new Promise<acp.RequestPermissionResponse>(resolve => {
        session.pending.set(requestId, outcome => {
          session.pending.delete(requestId)
          pushEvent(channel, { type: 'permission_resolved', requestId, ts: now() })
          resolve({ outcome })
        })
      })
    },
  }
}

async function spawnSession(projectId: string, channel: Channel): Promise<AcpSession> {
  const cwd = projectDir(projectId)
  dbg(projectId, `spawning agent`, { cmd: AGENT_CMD[0], args: AGENT_CMD[1], cwd })
  const child = spawn(AGENT_CMD[0], AGENT_CMD[1], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  })
  dbg(projectId, `spawned pid=${child.pid ?? '?'}`)

  let earlyError: Error | null = null
  child.once('error', (err: Error) => {
    earlyError = err
    dbg(projectId, `spawn error: ${err.message}`)
  })

  if (!child.stdin || !child.stdout || !child.stderr) {
    child.kill()
    throw new Error('Agent stdio pipes unavailable')
  }

  // Surface child stderr with a project-tagged prefix so upstream errors
  // (binary missing, permission denied, stack traces) are attributable.
  const stderrSink = makeLineSink(line => dbg(projectId, `[stderr] ${line}`))
  child.stderr.on('data', stderrSink)

  // Tap inbound (agent → us) ndjson frames before handing them to the SDK.
  const inboundLineSink = makeLineSink(line => dbg(projectId, `← ${truncate(line)}`))
  const inbound = new Transform({
    transform(chunk, _enc, cb) {
      if (DEBUG_ACP_FRAMES) inboundLineSink(chunk)
      cb(null, chunk)
    },
  })
  inbound.on('error', err => dbg(projectId, `inbound transform error: ${err.message}`))
  child.stdout.pipe(inbound)

  // Tap outbound (us → agent) ndjson frames before they hit child stdin.
  const outboundLineSink = makeLineSink(line => dbg(projectId, `→ ${truncate(line)}`))
  const outbound = new Transform({
    transform(chunk, _enc, cb) {
      if (DEBUG_ACP_FRAMES) outboundLineSink(chunk)
      cb(null, chunk)
    },
  })
  outbound.on('error', err => dbg(projectId, `outbound transform error: ${err.message}`))
  outbound.pipe(child.stdin)
  child.stdin.on('error', err => dbg(projectId, `stdin error: ${err.message}`))

  const writableWeb = Writable.toWeb(outbound) as WritableStream<Uint8Array>
  const readableWeb = Readable.toWeb(inbound) as ReadableStream<Uint8Array>
  const stream = acp.ndJsonStream(writableWeb, readableWeb)

  const client = buildClient(channel, projectId)
  const conn = new acp.ClientSideConnection(() => client, stream)

  try {
    dbg(projectId, `initialize → protocol v${acp.PROTOCOL_VERSION}`)
    await conn.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: false,
      },
    })
    dbg(projectId, `initialize ✓`)
  } catch (err) {
    dbg(projectId, `initialize ✗ ${(err as Error).message}`)
    child.kill()
    if (earlyError) throw earlyError
    throw err
  }

  dbg(projectId, `newSession → cwd=${cwd}`)
  const newSessionRes = await conn.newSession({ cwd, mcpServers: [] })
  dbg(projectId, `newSession ✓ id=${newSessionRes.sessionId}`)

  const session: AcpSession = {
    child,
    conn,
    sessionId: newSessionRes.sessionId,
    pending: new Map(),
  }

  child.on('exit', (code, signal) => {
    dbg(projectId, `agent exited code=${code} signal=${signal ?? 'none'}`)
    pushEvent(channel, { type: 'agent_exited', code, ts: now() })
    for (const resolve of session.pending.values()) {
      resolve({ outcome: 'cancelled' })
    }
    session.pending.clear()
    if (channel.session === session) {
      channel.session = null
    }
  })

  return session
}

async function ensureSession(projectId: string): Promise<{ channel: Channel; session: AcpSession }> {
  const channel = getChannel(projectId)
  if (channel.session) return { channel, session: channel.session }
  if (!channel.spawning) {
    channel.spawning = spawnSession(projectId, channel)
      .then(s => {
        channel.session = s
        channel.spawning = null
        return s
      })
      .catch(err => {
        channel.spawning = null
        throw err
      })
  }
  const session = await channel.spawning
  return { channel, session }
}

export async function promptChat(projectId: string, text: string): Promise<void> {
  if (!projectExists(projectId)) throw new Error('Project not found')
  dbg(projectId, `promptChat (${text.length} chars)`)
  let channel: Channel
  let session: AcpSession
  try {
    ({ channel, session } = await ensureSession(projectId))
  } catch (err) {
    dbg(projectId, `ensureSession ✗ ${(err as Error).message}`)
    const ch = getChannel(projectId)
    pushEvent(ch, {
      type: 'agent_error',
      message: `Failed to start agent: ${(err as Error).message}`,
      ts: now(),
    })
    throw err
  }

  pushEvent(channel, { type: 'user_message', text, ts: now() })

  // Fire-and-forget: stream completes via session/update notifications;
  // we broadcast turn_ended when the response Promise resolves.
  dbg(projectId, `prompt → session=${session.sessionId} text=${truncate(JSON.stringify(text), 120)}`)
  session.conn
    .prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text }],
    })
    .then(res => {
      dbg(projectId, `prompt ✓ stopReason=${res.stopReason}`)
      pushEvent(channel, { type: 'turn_ended', stopReason: res.stopReason, ts: now() })
    })
    .catch(err => {
      dbg(projectId, `prompt ✗ ${(err as Error).message}`)
      pushEvent(channel, {
        type: 'agent_error',
        message: (err as Error).message,
        ts: now(),
      })
    })
}

export async function cancelChat(projectId: string): Promise<void> {
  const channel = channels.get(projectId)
  const session = channel?.session
  if (!session) return
  dbg(projectId, `cancel → session=${session.sessionId}`)
  await session.conn.cancel({ sessionId: session.sessionId })
}

export function resetChat(projectId: string): void {
  const channel = channels.get(projectId)
  if (!channel) return
  const session = channel.session
  if (session) {
    dbg(projectId, `reset → killing session=${session.sessionId}`)
    session.child.kill()
  }
  channel.log = []
  pushEvent(channel, { type: 'chat_reset', ts: now() })
}

export function respondPermission(
  projectId: string,
  requestId: string,
  outcome: PermissionOutcome,
): boolean {
  const session = channels.get(projectId)?.session
  if (!session) return false
  const resolver = session.pending.get(requestId)
  if (!resolver) return false
  resolver(outcome)
  return true
}

export function subscribeChat(projectId: string, res: ServerResponse): boolean {
  if (!projectExists(projectId)) return false
  const channel = getChannel(projectId)
  if (DEBUG_ACP) console.log(`[acp:${projectId}] subscribe (replaying ${channel.log.length}, subs=${channel.subs.size}→${channel.subs.size + 1})`)
  for (const event of channel.log) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    } catch {
      return false
    }
  }
  channel.subs.add(res)
  res.on('close', () => {
    channel.subs.delete(res)
    if (DEBUG_ACP) console.log(`[acp:${projectId}] subscribe closed (subs=${channel.subs.size})`)
  })
  return true
}
