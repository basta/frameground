import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  cancelChat,
  resetChat,
  respondPermission,
  sendChat,
  type ChatEvent,
  type PermissionOption,
  type ToolCallUpdate,
} from '../lib/chat'

interface Props {
  projectId: string
  frameIds: string[]
  onClose: () => void
  onJumpToFrame: (frameId: string) => void
}

type AgentBubble = {
  kind: 'agent'
  id: string
  text: string
}

type UserBubble = {
  kind: 'user'
  id: string
  text: string
}

type ToolCallView = {
  kind: 'tool'
  toolCallId: string
  title: string
  toolKind: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  locations: { path: string; line?: number | null }[]
  content: ToolCallUpdate['content']
}

type Item = UserBubble | AgentBubble | ToolCallView

interface ViewModel {
  items: Item[]
  pendingPermission: { requestId: string; toolCall: ToolCallUpdate; options: PermissionOption[] } | null
  agentBusy: boolean
  lastError: string | null
  exited: boolean
  usage: { used: number; size: number } | null
}

function computeViewModel(events: ChatEvent[]): ViewModel {
  let items: Item[] = []
  let toolIdx = new Map<string, number>()
  let userCounter = 0
  let agentCounter = 0
  let pendingPermission: ViewModel['pendingPermission'] = null
  let agentBusy = false
  let lastError: string | null = null
  let exited = false
  let usage: ViewModel['usage'] = null

  for (const event of events) {
    if (event.type === 'chat_reset') {
      items = []
      toolIdx = new Map()
      pendingPermission = null
      agentBusy = false
      lastError = null
      exited = false
      usage = null
    } else if (event.type === 'user_message') {
      items.push({ kind: 'user', id: `u-${userCounter++}-${event.ts}`, text: event.text })
      agentBusy = true
      lastError = null
      exited = false
    } else if (event.type === 'session_update') {
      const update = event.update
      if (update.sessionUpdate === 'agent_message_chunk') {
        const text = update.content.type === 'text' ? update.content.text : ''
        if (!text) continue
        const last = items[items.length - 1]
        if (last && last.kind === 'agent') {
          items[items.length - 1] = { ...last, text: last.text + text }
        } else {
          const id = `a-${agentCounter++}-${event.ts}`
          items.push({ kind: 'agent', id, text })
        }
      } else if (update.sessionUpdate === 'tool_call') {
        toolIdx.set(update.toolCallId, items.length)
        items.push({
          kind: 'tool',
          toolCallId: update.toolCallId,
          title: update.title,
          toolKind: update.kind ?? 'other',
          status: update.status ?? 'pending',
          locations: update.locations ?? [],
          content: update.content,
        })
      } else if (update.sessionUpdate === 'tool_call_update') {
        const idx = toolIdx.get(update.toolCallId)
        if (idx === undefined) continue
        const existing = items[idx] as ToolCallView
        items[idx] = {
          ...existing,
          title: update.title ?? existing.title,
          toolKind: update.kind ?? existing.toolKind,
          status: update.status ?? existing.status,
          locations: update.locations ?? existing.locations,
          content: update.content ?? existing.content,
        }
      } else if (update.sessionUpdate === 'usage_update') {
        usage = { used: update.used, size: update.size }
      }
    } else if (event.type === 'permission_request') {
      pendingPermission = { requestId: event.requestId, toolCall: event.toolCall, options: event.options }
    } else if (event.type === 'permission_resolved') {
      if (pendingPermission && pendingPermission.requestId === event.requestId) {
        pendingPermission = null
      }
    } else if (event.type === 'turn_ended') {
      agentBusy = false
      pendingPermission = null
    } else if (event.type === 'agent_error') {
      lastError = event.message
      agentBusy = false
    } else if (event.type === 'agent_exited') {
      exited = true
      agentBusy = false
    }
  }

  return { items, pendingPermission, agentBusy, lastError, exited, usage }
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1000
    return (k < 10 ? k.toFixed(1) : Math.round(k).toString()) + 'k'
  }
  return (n / 1_000_000).toFixed(1) + 'M'
}

function frameIdFromPath(p: string, frameIds: Set<string>): string | null {
  // basename without .html extension
  const slash = p.lastIndexOf('/')
  const base = slash === -1 ? p : p.slice(slash + 1)
  if (!base.endsWith('.html')) return null
  const id = base.slice(0, -5)
  return frameIds.has(id) ? id : null
}

export function ChatDock({ projectId, frameIds, onClose, onJumpToFrame }: Props) {
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const eventsRef = useRef<ChatEvent[]>([])
  const flushPending = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const wasAtBottom = useRef(true)
  const frameIdSet = useMemo(() => new Set(frameIds), [frameIds])

  const flush = useCallback(() => {
    flushPending.current = false
    setEvents(eventsRef.current.slice())
  }, [])

  useEffect(() => {
    const source = new EventSource(`/api/projects/${projectId}/chat/events`)
    source.onmessage = ev => {
      try {
        const parsed = JSON.parse(ev.data) as ChatEvent
        eventsRef.current.push(parsed)
        if (!flushPending.current) {
          flushPending.current = true
          requestAnimationFrame(flush)
        }
      } catch {
        // ignore malformed event
      }
    }
    return () => {
      source.close()
      eventsRef.current = []
      flushPending.current = false
    }
  }, [projectId, flush])

  const view = useMemo(() => computeViewModel(events), [events])

  // Track scroll position so we only auto-stick to bottom when the user
  // hasn't scrolled up to read history.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  useEffect(() => {
    if (!wasAtBottom.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [view.items.length, view.pendingPermission])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      await sendChat(projectId, text)
    } catch (err) {
      // Surface via local error; agent_error events will also flow if server-side.
      eventsRef.current.push({
        type: 'agent_error',
        message: (err as Error).message,
        ts: Date.now(),
      })
      flush()
    } finally {
      setSending(false)
    }
  }, [input, sending, projectId, flush])

  const handleCancel = useCallback(async () => {
    try {
      await cancelChat(projectId)
    } catch {
      // ignore
    }
  }, [projectId])

  const handleReset = useCallback(async () => {
    try {
      await resetChat(projectId)
    } catch {
      // ignore
    }
  }, [projectId])

  const handlePermission = useCallback(
    async (response: { optionId: string } | { cancelled: true }) => {
      const pending = view.pendingPermission
      if (!pending) return
      try {
        await respondPermission(projectId, pending.requestId, response)
      } catch {
        // ignore
      }
    },
    [projectId, view.pendingPermission],
  )

  const inputDisabled = sending || view.pendingPermission !== null

  return (
    <aside style={panelStyle}>
      <style>{MARKDOWN_CSS}</style>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Chat</span>
          <span style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectId}
          </span>
          {view.usage && <ContextChip usage={view.usage} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={handleReset}
            title="Reset context (clears chat & restarts agent)"
            style={iconBtnStyle}
          >
            ↻
          </button>
          <button onClick={onClose} title="Close (C)" style={iconBtnStyle}>×</button>
        </div>
      </header>

      {view.exited && (
        <div style={bannerStyle('#fff4f4', '#f3c0c0', '#c33')}>
          Agent exited. Send a message to restart.
        </div>
      )}
      {view.lastError && !view.exited && (
        <div style={bannerStyle('#fff4f4', '#f3c0c0', '#c33')}>{view.lastError}</div>
      )}

      <div ref={scrollRef} onScroll={handleScroll} style={bodyStyle}>
        {view.items.length === 0 && (
          <div style={emptyHintStyle}>
            Describe a frame and Claude will design it on the canvas.
            <br /><br />
            Try: <em>"a hero frame for a coffee shop landing page"</em>
          </div>
        )}
        {view.items.map(item => {
          if (item.kind === 'user') {
            return (
              <div key={item.id} style={userBubbleWrapStyle}>
                <div style={userBubbleStyle}>{item.text}</div>
              </div>
            )
          }
          if (item.kind === 'agent') {
            return (
              <div key={item.id} style={agentBubbleStyle} className="od-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
              </div>
            )
          }
          return (
            <ToolCallCard
              key={item.toolCallId}
              tool={item}
              frameIds={frameIdSet}
              onJumpToFrame={onJumpToFrame}
            />
          )
        })}
        {view.agentBusy && !view.pendingPermission && (
          <div style={typingStyle}>● ● ●</div>
        )}
      </div>

      {view.pendingPermission && (
        <PermissionCard
          options={view.pendingPermission.options}
          toolCall={view.pendingPermission.toolCall}
          onChoose={handlePermission}
        />
      )}

      <footer style={footerStyle}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={inputDisabled ? 'Waiting…' : 'Describe a frame…'}
          disabled={inputDisabled}
          style={textareaStyle}
          rows={2}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
          {view.agentBusy && (
            <button onClick={handleCancel} style={ghostBtnStyle(false)}>Cancel</button>
          )}
          <button
            onClick={handleSend}
            disabled={inputDisabled || !input.trim()}
            style={primaryBtnStyle(inputDisabled || !input.trim())}
          >
            Send
          </button>
        </div>
      </footer>
    </aside>
  )
}

function ContextChip({ usage }: { usage: { used: number; size: number } }) {
  const pct = usage.size > 0 ? Math.min(100, (usage.used / usage.size) * 100) : 0
  const color = pct >= 90 ? '#c33' : pct >= 70 ? '#b56b00' : '#666'
  return (
    <span
      title={`${usage.used.toLocaleString()} / ${usage.size.toLocaleString()} tokens (${pct.toFixed(1)}%)`}
      style={{
        fontSize: 10,
        color,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '1px 5px',
        background: '#f4f4f2',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {formatTokens(usage.used)}/{formatTokens(usage.size)}
    </span>
  )
}

function ToolCallCard({
  tool,
  frameIds,
  onJumpToFrame,
}: {
  tool: ToolCallView
  frameIds: Set<string>
  onJumpToFrame: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dotColor =
    tool.status === 'pending' ? '#888' :
    tool.status === 'in_progress' ? '#2A4DFF' :
    tool.status === 'completed' ? '#3a3' :
    '#c33'

  const frameMatches = useMemo(() => {
    const out: { frameId: string; path: string }[] = []
    for (const loc of tool.locations) {
      const id = frameIdFromPath(loc.path, frameIds)
      if (id) out.push({ frameId: id, path: loc.path })
    }
    return out
  }, [tool.locations, frameIds])

  const hasContent = (tool.content?.length ?? 0) > 0

  return (
    <div style={toolCardStyle}>
      <div style={toolHeaderRowStyle}>
        <span style={{ ...dotStyle, background: dotColor }} />
        <span style={kindChipStyle}>{tool.toolKind}</span>
        <span style={toolTitleStyle} title={tool.title}>{tool.title}</span>
        {hasContent && (
          <button onClick={() => setOpen(o => !o)} style={discloseBtnStyle}>
            {open ? '▾' : '▸'}
          </button>
        )}
      </div>
      {frameMatches.length > 0 && (
        <div style={chipRowStyle}>
          {frameMatches.map(m => (
            <button
              key={m.frameId}
              onClick={() => onJumpToFrame(m.frameId)}
              style={frameChipStyle}
              title={m.path}
            >
              → {m.frameId}
            </button>
          ))}
        </div>
      )}
      {open && hasContent && (
        <div style={toolContentStyle}>
          {tool.content!.map((c, i) => (
            <ToolContentBlock key={i} content={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolContentBlock({ content }: { content: NonNullable<ToolCallUpdate['content']>[number] }) {
  if (content.type === 'content') {
    if (content.content.type === 'text') {
      return <pre style={preStyle}>{content.content.text}</pre>
    }
    return <pre style={preStyle}>[{content.content.type}]</pre>
  }
  if (content.type === 'diff') {
    return (
      <pre style={preStyle}>
        {`--- ${content.path}\n`}
        {content.oldText && `- ${content.oldText.split('\n').join('\n- ')}\n`}
        {`+ ${content.newText.split('\n').join('\n+ ')}`}
      </pre>
    )
  }
  if (content.type === 'terminal') {
    return <pre style={preStyle}>[terminal {content.terminalId}]</pre>
  }
  return null
}

function PermissionCard({
  options,
  toolCall,
  onChoose,
}: {
  options: PermissionOption[]
  toolCall: ToolCallUpdate
  onChoose: (response: { optionId: string } | { cancelled: true }) => void
}) {
  const path = toolCall.locations?.[0]?.path
  return (
    <div style={permCardStyle}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#7a5a00', marginBottom: 4 }}>
        Approve: {toolCall.title ?? toolCall.toolCallId}
      </div>
      {path && (
        <div style={{ fontSize: 10, color: '#7a5a00', marginBottom: 6, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
          {path}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(opt => (
          <button
            key={opt.optionId}
            onClick={() => onChoose({ optionId: opt.optionId })}
            style={
              opt.kind === 'allow_once' || opt.kind === 'allow_always'
                ? primaryBtnStyle(false)
                : ghostBtnStyle(false)
            }
          >
            {opt.name}
          </button>
        ))}
        <button onClick={() => onChoose({ cancelled: true })} style={ghostBtnStyle(false)}>
          Skip
        </button>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  width: 320,
  height: '100%',
  background: '#fafafa',
  borderLeft: '1px solid #e0e0e0',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  fontSize: 12,
  color: '#222',
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderBottom: '1px solid #e8e8e8',
  background: '#fff',
}
const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const emptyHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  lineHeight: 1.6,
  padding: '12px 4px',
}
const userBubbleWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
}
const userBubbleStyle: React.CSSProperties = {
  maxWidth: '85%',
  background: '#2A4DFF',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: 8,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
const agentBubbleStyle: React.CSSProperties = {
  maxWidth: '95%',
  background: '#fff',
  border: '1px solid #e8e8e8',
  color: '#222',
  padding: '6px 10px',
  borderRadius: 8,
  fontSize: 12,
  wordBreak: 'break-word',
}

const MARKDOWN_CSS = `
.od-md > :first-child { margin-top: 0; }
.od-md > :last-child { margin-bottom: 0; }
.od-md p { margin: 0 0 6px; line-height: 1.5; }
.od-md p:last-child { margin-bottom: 0; }
.od-md h1, .od-md h2, .od-md h3, .od-md h4, .od-md h5, .od-md h6 {
  margin: 8px 0 4px;
  font-weight: 600;
  line-height: 1.3;
}
.od-md h1 { font-size: 15px; }
.od-md h2 { font-size: 14px; }
.od-md h3 { font-size: 13px; }
.od-md h4, .od-md h5, .od-md h6 { font-size: 12px; }
.od-md ul, .od-md ol { margin: 0 0 6px; padding-left: 18px; }
.od-md li { margin: 2px 0; }
.od-md code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  background: #f4f4f2;
  padding: 1px 4px;
  border-radius: 3px;
}
.od-md pre {
  background: #f4f4f2;
  padding: 6px 8px;
  border-radius: 4px;
  margin: 4px 0 6px;
  overflow-x: auto;
}
.od-md pre code { background: none; padding: 0; }
.od-md blockquote {
  margin: 4px 0 6px;
  padding-left: 8px;
  border-left: 2px solid #e0e0e0;
  color: #666;
}
.od-md a { color: #2A4DFF; text-decoration: underline; }
.od-md hr { border: none; border-top: 1px solid #e8e8e8; margin: 8px 0; }
.od-md table {
  border-collapse: collapse;
  margin: 4px 0 6px;
  font-size: 11px;
  display: block;
  overflow-x: auto;
  max-width: 100%;
}
.od-md th, .od-md td {
  border: 1px solid #e0e0e0;
  padding: 3px 6px;
  text-align: left;
}
.od-md th { background: #f4f4f2; font-weight: 600; }
.od-md img { max-width: 100%; }
`
const toolCardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e8e8e8',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 11,
}
const toolHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 4,
  flexShrink: 0,
}
const kindChipStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '1px 5px',
  background: '#f2f1ee',
  color: '#666',
  borderRadius: 2,
  flexShrink: 0,
}
const toolTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: '#444',
}
const discloseBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  color: '#888',
  padding: '0 4px',
}
const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: 4,
}
const frameChipStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  background: '#eef2ff',
  border: '1px solid #c7d2fe',
  borderRadius: 3,
  color: '#2A4DFF',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const toolContentStyle: React.CSSProperties = {
  marginTop: 6,
  borderTop: '1px solid #f0f0ec',
  paddingTop: 6,
}
const preStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  color: '#444',
  maxHeight: 200,
  overflowY: 'auto',
}
const typingStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#bbb',
  letterSpacing: '0.4em',
  padding: '4px 4px',
}
const footerStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderTop: '1px solid #e8e8e8',
  background: '#fff',
}
const textareaStyle: React.CSSProperties = {
  width: '100%',
  resize: 'none',
  border: '1px solid #d8d8d8',
  borderRadius: 4,
  padding: '6px 8px',
  fontFamily: 'inherit',
  fontSize: 12,
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}
const permCardStyle: React.CSSProperties = {
  margin: '0 12px 8px',
  padding: '8px 10px',
  background: '#fff8e1',
  border: '1px solid #e3b341',
  borderRadius: 4,
  fontSize: 11,
}
const ghostBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  fontSize: 11,
  background: '#fff',
  border: '1px solid #d8d8d8',
  borderRadius: 3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? '#bbb' : '#444',
  fontFamily: 'inherit',
})
const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  fontSize: 11,
  fontWeight: 600,
  background: disabled ? '#cfd6f5' : '#2A4DFF',
  color: '#fff',
  border: 'none',
  borderRadius: 3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'inherit',
})
const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  color: '#666',
  padding: '0 4px',
}
const bannerStyle = (bg: string, border: string, color: string): React.CSSProperties => ({
  margin: '8px 12px 0',
  padding: '6px 8px',
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 3,
  fontSize: 11,
  color,
})
