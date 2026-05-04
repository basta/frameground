import { useState } from 'react'
import { resetChat } from '../lib/chat'
import { testAgent, type AgentProvider, type AgentTestResult, type GlobalSettings } from '../lib/api'
import type { UseSettings } from '../hooks/useSettings'
import type { ProjectDesign } from '../hooks/useDesignDoc'
import { useAgentModels } from '../hooks/useAgentModels'

interface Props {
  projectId: string
  settings: UseSettings
  design: ProjectDesign | null
  frameCount: number
  onClose: () => void
}

const PROVIDERS: { id: AgentProvider; name: string; markBg: string; markColor: string }[] = [
  { id: 'claude-code', name: 'Claude Code', markBg: '#f5f3ee', markColor: '#c15c3c' },
  { id: 'codex', name: 'Codex', markBg: '#f3f3f3', markColor: '#111' },
  { id: 'gemini', name: 'Gemini-cli', markBg: '#eef2f9', markColor: '#1f6cd9' },
  { id: 'opencode', name: 'OpenCode', markBg: '#f1f1f0', markColor: '#333' },
]

function isDesignFilled(design: ProjectDesign | null): boolean {
  if (!design) return false
  const tokens = design.design.tokens
  const filledKey = (key: string) => {
    const v = tokens[key]
    return !!v && typeof v === 'object' && Object.keys(v as object).length > 0
  }
  return filledKey('colors') && filledKey('typography')
}

export function SettingsPanel({ projectId, settings, design, frameCount, onClose }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ agent: true })
  const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !o[key] }))

  const g = settings.global
  const designFilled = isDesignFilled(design)

  const agentSummary = `${providerLabel(g.agent.provider)} · ${g.agent.model}`
  const canvasSummary = [
    g.canvas.snap ? 'snap on' : 'snap off',
    `${g.canvas.snapPx}px`,
    `fit ${g.canvas.fitDurationMs}ms`,
  ].join(' · ')
  const projectSummary = `${frameCount} frame${frameCount === 1 ? '' : 's'} · DESIGN.md ${designFilled ? 'filled' : 'empty'}`

  return (
    <aside style={panelStyle}>
      <header style={headerStyle}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Settings</span>
        <button onClick={onClose} title="Close (S)" style={iconBtnStyle}>×</button>
      </header>

      <div style={bodyStyle}>
        <Scope label="Global" meta="~/.opendesign">
          <Item
            open={!!open.agent}
            onToggle={() => toggle('agent')}
            icon={<StarIcon />}
            name="Agent"
            summary={agentSummary}
          >
            <AgentBody projectId={projectId} settings={settings} onResetChat={() => { resetChat(projectId).catch(() => {}) }} />
          </Item>

          <Item
            open={!!open.canvas}
            onToggle={() => toggle('canvas')}
            icon={<GridIcon />}
            name="Canvas"
            summary={canvasSummary}
          >
            <CanvasBody settings={settings} />
          </Item>
        </Scope>

        <Scope label="This project" meta={projectId}>
          <Item
            open={!!open.project}
            onToggle={() => toggle('project')}
            icon={<FolderIcon />}
            name="Project"
            summary={projectSummary}
          >
            <ProjectBody projectId={projectId} frameCount={frameCount} designFilled={designFilled} />
          </Item>

          <Item
            open={!!open.design}
            onToggle={() => toggle('design')}
            icon={<FileIcon />}
            name="Design files"
            summary="PROJECT.md · DESIGN.md · FEEL.md"
          >
            <DesignFilesBody projectId={projectId} />
          </Item>
        </Scope>
      </div>

      <footer style={footerStyle}>
        <span>Frameground 0.1.0-alpha</span>
        <span>
          <a href="https://github.com/basta/frameground" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            GitHub
          </a>
        </span>
      </footer>
    </aside>
  )
}

function providerLabel(p: AgentProvider): string {
  return PROVIDERS.find(x => x.id === p)?.name ?? p
}

function Scope({ label, meta, children }: { label: string; meta: string; children: React.ReactNode }) {
  return (
    <div style={scopeStyle}>
      <div style={scopeLabelStyle}>
        <span>{label}</span>
        <span style={scopeMetaStyle}>{meta}</span>
      </div>
      <div style={scopeItemsStyle}>{children}</div>
    </div>
  )
}

function Item({
  open,
  onToggle,
  icon,
  iconBg,
  iconColor,
  name,
  summary,
  children,
}: {
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  iconBg?: string
  iconColor?: string
  name: string
  summary: string
  children: React.ReactNode
}) {
  return (
    <div style={itemStyle(open)}>
      <button onClick={onToggle} style={itemHeaderStyle(open)}>
        <span style={itemIconStyle(iconBg, iconColor)}>{icon}</span>
        <span style={itemTitleStyle}>
          <span style={itemNameStyle}>{name}</span>
          <span style={itemSummaryStyle}>{summary}</span>
        </span>
        <span style={chevronStyle(open)}>›</span>
      </button>
      {open && <div style={itemBodyStyle}>{children}</div>}
    </div>
  )
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'done'; result: AgentTestResult }

function AgentBody({
  projectId,
  settings,
  onResetChat,
}: {
  projectId: string
  settings: UseSettings
  onResetChat: () => void
}) {
  const { global, patchGlobal } = settings
  const agentModels = useAgentModels(projectId)
  const models = agentModels.state?.availableModels ?? []
  const currentModelId = agentModels.state?.currentModelId ?? global.agent.model
  const source = agentModels.state?.source
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [switching, setSwitching] = useState(false)
  const [switchNote, setSwitchNote] = useState<string | null>(null)

  const runTest = async () => {
    setTest({ status: 'testing' })
    try {
      const result = await testAgent()
      setTest({ status: 'done', result })
    } catch (e) {
      setTest({
        status: 'done',
        result: {
          ok: false,
          provider: global.agent.provider,
          label: '',
          error: (e as Error).message,
          command: '',
          stderr: '',
        },
      })
    }
  }

  return (
    <>
      <div style={providersGridStyle}>
        {PROVIDERS.map(p => {
          const selected = global.agent.provider === p.id
          return (
            <button
              key={p.id}
              onClick={() => {
                if (selected) return
                const ok = window.confirm(
                  `Switch agent to ${p.name}?\n\nThis will reset any active chat session and spawn the new agent on the next prompt.`,
                )
                if (!ok) return
                patchGlobal({ agent: { provider: p.id } })
                // Provider change kills the session server-side; refresh to
                // pick up the new provider's fallback model list.
                setTimeout(() => agentModels.refresh(), 300)
              }}
              style={providerBtnStyle(selected)}
              title={selected ? 'Active' : `Switch to ${p.name}`}
            >
              <span style={providerMarkStyle(p.markBg, p.markColor)}>{p.name[0]}</span>
              <span style={providerNameStyle}>{p.name}</span>
            </button>
          )
        })}
      </div>

      <Row label="Model">
        <select
          value={currentModelId ?? ''}
          disabled={switching || models.length === 0}
          onChange={async e => {
            const next = e.target.value
            if (!next || next === currentModelId) return
            setSwitching(true)
            setSwitchNote(null)
            try {
              const res = await agentModels.setModel(next)
              setSwitchNote(res.via === 'session' ? 'switched live' : 'will apply on next prompt')
            } catch (err) {
              setSwitchNote(`failed: ${(err as Error).message}`)
            } finally {
              setSwitching(false)
            }
          }}
          style={selectStyle}
        >
          {models.length === 0 && <option value="">(none)</option>}
          {models.map(m => <option key={m.modelId} value={m.modelId}>{m.name}</option>)}
        </select>
        {source === 'fallback' && models.length > 0 && (
          <span style={{ ...authTextStyle, fontSize: 9, color: '#999' }} title="Agent hasn't reported availableModels yet — using hardcoded fallback list">
            fallback
          </span>
        )}
        {switchNote && (
          <span style={{ ...authTextStyle, fontSize: 10, color: switchNote.startsWith('failed') ? '#c44' : '#3a7' }}>
            {switchNote}
          </span>
        )}
      </Row>

      <Row label="Debug logs">
        <Toggle
          checked={global.agent.debugAcp}
          onChange={v => patchGlobal({ agent: { debugAcp: v } })}
          label="ACP"
        />
        <Toggle
          checked={global.agent.debugAcpFrames}
          onChange={v => patchGlobal({ agent: { debugAcpFrames: v } })}
          label="frames"
        />
      </Row>

      <Row label="Health">
        <button
          onClick={runTest}
          style={ghostBtnStyle(test.status === 'testing')}
          disabled={test.status === 'testing'}
          title="Spawn the agent and run an ACP handshake"
        >
          {test.status === 'testing' ? 'Testing…' : 'Test setup'}
        </button>
        <TestStatusInline state={test} />
      </Row>
      <TestLog state={test} />

      <Row label="Session">
        <button onClick={onResetChat} style={ghostBtnStyle(false)}>Reset chat</button>
      </Row>
    </>
  )
}

function TestStatusInline({ state }: { state: TestState }) {
  if (state.status === 'idle') return null
  if (state.status === 'testing') {
    return <span style={authTextStyle}>connecting…</span>
  }
  const { result } = state
  if (result.ok) {
    return (
      <span style={{ ...authTextStyle, color: '#3a7' }} title={`ACP v${result.protocolVersion}`}>
        ✓ {result.label} · {result.durationMs}ms
      </span>
    )
  }
  return (
    <span style={{ ...authTextStyle, color: '#c44' }}>
      ✗ failed
    </span>
  )
}

function TestLog({ state }: { state: TestState }) {
  if (state.status !== 'done' || state.result.ok) return null
  const { result } = state
  const stderrTrimmed = result.stderr.trim()
  return (
    <div style={terminalWrapStyle}>
      <div style={terminalHeaderStyle}>
        <span style={{ color: '#888' }}>$</span>
        <span style={{ flex: 1 }}>{result.command}</span>
        <button
          onClick={() => {
            const blob = `$ ${result.command}\n${result.error}\n${stderrTrimmed ? '\n' + stderrTrimmed : ''}`
            navigator.clipboard?.writeText(blob).catch(() => {})
          }}
          style={terminalCopyBtnStyle}
          title="Copy log"
        >
          copy
        </button>
      </div>
      <pre style={terminalBodyStyle}>
        <span style={{ color: '#f88' }}>{result.error}</span>
        {stderrTrimmed && (
          <>
            {'\n\n'}
            <span style={{ color: '#aaa' }}>── stderr ──</span>
            {'\n'}
            <span style={{ color: '#ddd' }}>{stderrTrimmed}</span>
          </>
        )}
        {!stderrTrimmed && (
          <>
            {'\n\n'}
            <span style={{ color: '#888', fontStyle: 'italic' }}>(no stderr output)</span>
          </>
        )}
      </pre>
    </div>
  )
}

function CanvasBody({ settings }: { settings: UseSettings }) {
  const { global, patchGlobal } = settings
  return (
    <>
      <Row label="Snap to align">
        <Toggle
          checked={global.canvas.snap}
          onChange={v => patchGlobal({ canvas: { snap: v } })}
          label={global.canvas.snap ? 'on' : 'off'}
        />
      </Row>
      <Row label="Snap distance">
        <NumberInput
          value={global.canvas.snapPx}
          min={1}
          max={32}
          suffix="px"
          onChange={v => patchGlobal({ canvas: { snapPx: v } })}
        />
      </Row>
      <Row label="Fit-to-frame">
        <NumberInput
          value={global.canvas.fitDurationMs}
          min={0}
          max={2000}
          step={50}
          suffix="ms"
          onChange={v => patchGlobal({ canvas: { fitDurationMs: v } })}
        />
      </Row>
    </>
  )
}

function ProjectBody({ projectId, frameCount, designFilled }: { projectId: string; frameCount: number; designFilled: boolean }) {
  return (
    <>
      <Row label="Id">
        <span style={authTextStyle} title={projectId}>{projectId}</span>
      </Row>
      <Row label="Frames">
        <span style={authTextStyle}>{frameCount}</span>
      </Row>
      <Row label="DESIGN.md">
        <span style={dotStyle(designFilled ? '#3a3' : '#bbb')} />
        <span style={authTextStyle}>{designFilled ? 'filled' : 'empty'}</span>
      </Row>
    </>
  )
}

function DesignFilesBody({ projectId }: { projectId: string }) {
  const files = ['PROJECT.md', 'DESIGN.md', 'FEEL.md', 'shared.css'] as const
  return (
    <>
      {files.map(f => (
        <Row key={f} label={f}>
          <button
            onClick={() => { navigator.clipboard?.writeText(`projects/${projectId}/${f}`).catch(() => {}) }}
            style={ghostBtnStyle(false)}
            title="Copy path"
          >
            Copy path
          </button>
        </Row>
      ))}
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={rowCtrlStyle}>{children}</span>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={toggleLabelStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ margin: 0 }}
      />
      {label && <span style={authTextStyle}>{label}</span>}
    </label>
  )
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        style={numberInputStyle}
      />
      {suffix && <span style={{ fontSize: 10, color: '#888' }}>{suffix}</span>}
    </span>
  )
}

// ── icons ──────────────────────────────────────────────────────────────

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M12 2 L13.4 9.6 L21 11 L13.4 12.4 L12 20 L10.6 12.4 L3 11 L10.6 9.6 Z" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9 H20 M9 4 V20" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7 V19 A2 2 0 0 0 5 21 H19 A2 2 0 0 0 21 19 V9 A2 2 0 0 0 19 7 H12 L10 5 H5 A2 2 0 0 0 3 7 Z" />
    </svg>
  )
}
function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3 H6 A2 2 0 0 0 4 5 V19 A2 2 0 0 0 6 21 H18 A2 2 0 0 0 20 19 V9 Z" />
      <path d="M14 3 V9 H20" />
    </svg>
  )
}
// ── styles ──────────────────────────────────────────────────────────────

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
  flexShrink: 0,
}
const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  color: '#666',
  padding: '0 4px',
}
const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 8px',
}
const scopeStyle: React.CSSProperties = { padding: '12px 4px 4px' }
const scopeLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#888',
  padding: '0 4px 6px',
}
const scopeMetaStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  textTransform: 'none',
  letterSpacing: 0,
  color: '#aaa',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const scopeItemsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const itemStyle = (open: boolean): React.CSSProperties => ({
  background: '#fff',
  border: `1px solid ${open ? '#d8d8d8' : '#e8e8e8'}`,
  borderRadius: 6,
  overflow: 'hidden',
})
const itemHeaderStyle = (open: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  cursor: 'pointer',
  background: '#fff',
  border: 'none',
  borderBottom: open ? '1px solid #f0f0ec' : 'none',
  width: '100%',
  textAlign: 'left',
  fontFamily: 'inherit',
  color: 'inherit',
})
const itemIconStyle = (bg = '#f2f1ee', color = '#666'): React.CSSProperties => ({
  width: 22,
  height: 22,
  borderRadius: 4,
  background: bg,
  color,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
})
const itemTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
}
const itemNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#222',
}
const itemSummaryStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
  marginTop: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const chevronStyle = (open: boolean): React.CSSProperties => ({
  fontSize: 12,
  color: '#999',
  flexShrink: 0,
  transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
  transition: 'transform 0.12s',
})
const itemBodyStyle: React.CSSProperties = {
  padding: '10px 12px 12px',
  background: '#fff',
}
const providersGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
  marginBottom: 10,
}
const providerBtnStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: 7,
  background: '#fff',
  border: `1px solid ${selected ? '#2A4DFF' : '#e8e8e8'}`,
  boxShadow: selected ? 'inset 0 0 0 1px #2A4DFF' : 'none',
  borderRadius: 4,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  color: 'inherit',
})
const providerMarkStyle = (bg: string, color: string): React.CSSProperties => ({
  width: 18,
  height: 18,
  borderRadius: 3,
  background: bg,
  color,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 700,
})
const providerNameStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#222',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 0',
  borderTop: '1px solid #f0f0ec',
}
const rowLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#555',
  flexShrink: 0,
}
const rowCtrlStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}
const selectStyle: React.CSSProperties = {
  padding: '3px 6px',
  border: '1px solid #d8d8d8',
  borderRadius: 3,
  background: '#fff',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const numberInputStyle: React.CSSProperties = {
  width: 60,
  padding: '3px 6px',
  border: '1px solid #d8d8d8',
  borderRadius: 3,
  background: '#fff',
  fontSize: 11,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const terminalWrapStyle: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 6,
  border: '1px solid #2a2a2a',
  borderRadius: 4,
  overflow: 'hidden',
  background: '#1c1c1c',
}
const terminalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  background: '#222',
  borderBottom: '1px solid #2a2a2a',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  color: '#ddd',
}
const terminalCopyBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #444',
  borderRadius: 3,
  color: '#aaa',
  fontSize: 9,
  fontFamily: 'inherit',
  padding: '1px 6px',
  cursor: 'pointer',
}
const terminalBodyStyle: React.CSSProperties = {
  margin: 0,
  padding: '6px 8px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  lineHeight: 1.5,
  color: '#ddd',
  maxHeight: 200,
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
const dotStyle = (bg: string): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 4,
  background: bg,
  display: 'inline-block',
})
const authTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#555',
}
const toggleLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  cursor: 'pointer',
}
const ghostBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '3px 8px',
  fontSize: 11,
  background: '#fff',
  border: '1px solid #d8d8d8',
  borderRadius: 3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? '#bbb' : '#444',
  fontFamily: 'inherit',
})
const footerStyle: React.CSSProperties = {
  marginTop: 'auto',
  padding: '10px 12px',
  borderTop: '1px solid #e8e8e8',
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 10,
  color: '#999',
  flexShrink: 0,
}
const linkStyle: React.CSSProperties = {
  color: '#2A4DFF',
  textDecoration: 'none',
  marginLeft: 8,
}

// Mark unused for SettingsPanel.tsx export to satisfy strict checks if ever needed.
export type { GlobalSettings }
