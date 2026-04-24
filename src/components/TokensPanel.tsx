import { useCallback, useMemo, useState } from 'react'
import type { ProjectDesign } from '../hooks/useDesignDoc'
import { patchDesignTokens, type Suggestion } from '../lib/api'

const SKIP_TOP_KEYS = new Set(['version', 'name', 'description', 'components'])
const REF_RE = /^\{([a-zA-Z0-9_.-]+)\}$/
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
const UNITLESS_NUM_RE = /^-?\d*\.?\d+$/

interface Props {
  projectId: string
  design: ProjectDesign | null
  overrides: Map<string, string>
  suggestions: Suggestion[]
  onSetOverride: (path: string[], value: string | null) => void
  onApplyVariant: (tokens: Record<string, unknown>) => void
  onDismissSuggestion: (id: string) => void
  onReset: () => void
  onClose: () => void
}

interface Leaf {
  path: string[]
  value: string | number
}

export function TokensPanel({
  projectId,
  design,
  overrides,
  suggestions,
  onSetOverride,
  onApplyVariant,
  onDismissSuggestion,
  onReset,
  onClose,
}: Props) {
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  const tokens = design?.design.tokens ?? {}
  const groups = useMemo(() => collectGroups(tokens), [tokens])

  const handleCommit = useCallback(async () => {
    if (overrides.size === 0) return
    setCommitting(true)
    setCommitError(null)
    try {
      const payload = buildPatchPayload(overrides)
      await patchDesignTokens(projectId, payload)
      onReset()
    } catch (e) {
      setCommitError((e as Error).message)
    } finally {
      setCommitting(false)
    }
  }, [overrides, projectId, onReset])

  const getValue = (path: string[], original: string | number): string => {
    const key = path.join('.')
    return overrides.has(key) ? overrides.get(key)! : String(original)
  }

  return (
    <aside style={panelStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Tokens</span>
          <span style={{ fontSize: 11, color: '#888' }}>{projectId}</span>
        </div>
        <button onClick={onClose} title="Close" style={iconBtnStyle}>×</button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {design?.parseError && (
          <div style={errorBoxStyle}>parse error: {design.parseError}</div>
        )}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Suggestions</h3>
          {suggestions.length === 0 ? (
            <div style={emptyHintStyle}>
              No suggestions yet. Run{' '}
              <code style={codeStyle}>/suggest {projectId} palette</code> from your terminal.
            </div>
          ) : (
            suggestions.map(s => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onApply={onApplyVariant}
                onDismiss={() => onDismissSuggestion(s.id)}
              />
            ))
          )}
        </section>
        {groups.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: '#888' }}>No tokens.</div>
        )}
        {groups.map(group => (
          <section key={group.title} style={sectionStyle}>
            <h3 style={sectionTitleStyle}>{group.title}</h3>
            {group.leaves.map(leaf => (
              <TokenRow
                key={leaf.path.join('.')}
                leaf={leaf}
                value={getValue(leaf.path, leaf.value)}
                isOverridden={overrides.has(leaf.path.join('.'))}
                onChange={v => onSetOverride(leaf.path, v)}
                onClear={() => onSetOverride(leaf.path, null)}
              />
            ))}
          </section>
        ))}
      </div>

      <footer style={footerStyle}>
        <span style={{ fontSize: 11, color: overrides.size > 0 ? '#2A4DFF' : '#888' }}>
          {overrides.size === 0 ? 'no overrides' : `${overrides.size} override${overrides.size === 1 ? '' : 's'}`}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onReset}
            disabled={overrides.size === 0 || committing}
            style={ghostBtnStyle(overrides.size === 0 || committing)}
          >
            Reset
          </button>
          <button
            onClick={handleCommit}
            disabled={overrides.size === 0 || committing}
            style={primaryBtnStyle(overrides.size === 0 || committing)}
          >
            {committing ? 'Saving…' : 'Commit'}
          </button>
        </div>
        {commitError && (
          <div style={{ flexBasis: '100%', fontSize: 11, color: '#c33', marginTop: 6 }}>{commitError}</div>
        )}
      </footer>
    </aside>
  )
}

function TokenRow({
  leaf,
  value,
  isOverridden,
  onChange,
  onClear,
}: {
  leaf: Leaf
  value: string
  isOverridden: boolean
  onChange: (v: string) => void
  onClear: () => void
}) {
  const label = leaf.path[leaf.path.length - 1]
  const original = String(leaf.value)
  const isRef = REF_RE.test(original)
  const isHex = HEX_RE.test(value)

  return (
    <div style={rowStyle(isOverridden)}>
      <label style={rowLabelStyle} title={leaf.path.join('.')}>{label}</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1, minWidth: 0 }}>
        {isHex && (
          <input
            type="color"
            value={normalizeHex6(value)}
            onChange={e => onChange(e.target.value)}
            style={swatchStyle}
          />
        )}
        {isRef && !isOverridden ? (
          <span style={refChipStyle} title={original}>→ {original.slice(1, -1)}</span>
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            style={textInputStyle}
            spellCheck={false}
          />
        )}
        {isOverridden && (
          <button onClick={onClear} title="Clear override" style={clearBtnStyle}>↺</button>
        )}
      </div>
    </div>
  )
}

interface Group { title: string; leaves: Leaf[] }

function collectGroups(tokens: Record<string, unknown>): Group[] {
  const groups: Group[] = []
  for (const key of Object.keys(tokens)) {
    if (SKIP_TOP_KEYS.has(key)) continue
    const val = tokens[key]
    const leaves: Leaf[] = []
    walkLeaves(val, [key], leaves)
    if (leaves.length > 0) groups.push({ title: key, leaves })
  }
  return groups
}

function walkLeaves(val: unknown, path: string[], out: Leaf[]): void {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    for (const k of Object.keys(val as Record<string, unknown>)) {
      walkLeaves((val as Record<string, unknown>)[k], [...path, k], out)
    }
  } else if (typeof val === 'string' || typeof val === 'number') {
    out.push({ path, value: val })
  }
}

function buildPatchPayload(overrides: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of overrides) {
    const path = key.split('.')
    let cursor = out
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i]
      const next = cursor[seg]
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[seg] = {}
      }
      cursor = cursor[seg] as Record<string, unknown>
    }
    cursor[path[path.length - 1]] = coerceForYaml(value)
  }
  return out
}

function coerceForYaml(value: string): string | number {
  if (UNITLESS_NUM_RE.test(value)) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return value
}

function normalizeHex6(hex: string): string {
  if (!HEX_RE.test(hex)) return '#000000'
  if (hex.length === 4) {
    return '#' + hex.slice(1).split('').map(c => c + c).join('')
  }
  return hex.slice(0, 7)
}

function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion: Suggestion
  onApply: (tokens: Record<string, unknown>) => void
  onDismiss: () => void
}) {
  return (
    <div style={cardStyle}>
      <header style={cardHeaderStyle}>
        <span style={tweakChipStyle}>{suggestion.tweak}</span>
        {suggestion.source === 'frame' && <span style={badgeStyle}>from frame</span>}
        {suggestion.prompt && (
          <span style={promptTextStyle} title={suggestion.prompt}>
            "{suggestion.prompt}"
          </span>
        )}
        <button onClick={onDismiss} style={dismissBtnStyle} title="Dismiss">×</button>
      </header>
      {suggestion.variants.map((v, i) => (
        <button
          key={`${suggestion.id}-${i}`}
          onClick={() => onApply(v.tokens)}
          style={variantRowStyle}
          title="Click to apply as overrides"
        >
          <div style={variantNameStyle}>{v.name}</div>
          {v.description && <div style={variantDescStyle}>{v.description}</div>}
          {suggestion.tweak === 'palette' && <PalettePreview tokens={v.tokens} />}
          {suggestion.tweak === 'typography' && <TypographyPreview tokens={v.tokens} />}
        </button>
      ))}
    </div>
  )
}

function PalettePreview({ tokens }: { tokens: Record<string, unknown> }) {
  const colors = (tokens.colors as Record<string, unknown> | undefined) ?? {}
  const swatches: { name: string; val: string }[] = []
  for (const [name, val] of Object.entries(colors)) {
    if (typeof val === 'string') swatches.push({ name, val })
  }
  if (swatches.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
      {swatches.slice(0, 10).map(s => (
        <div
          key={s.name}
          title={`${s.name}: ${s.val}`}
          style={{
            width: 18,
            height: 18,
            background: s.val,
            border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  )
}

function TypographyPreview({ tokens }: { tokens: Record<string, unknown> }) {
  const t = (tokens.typography as Record<string, unknown> | undefined) ?? {}
  const familyOf = (key: string): string | null => {
    const role = t[key] as Record<string, unknown> | undefined
    if (!role || typeof role !== 'object') return null
    const ff = role.fontFamily
    return typeof ff === 'string' ? ff : null
  }
  const display = familyOf('display')
  const body = familyOf('body')
  const mono = familyOf('mono')
  if (!display && !body && !mono) return null
  return (
    <div style={{ marginTop: 6, lineHeight: 1.3 }}>
      {display && (
        <div style={{ fontFamily: `'${display}', serif`, fontSize: 15, fontWeight: 600 }}>
          Aa <span style={typoFaceLabelStyle}>{display}</span>
        </div>
      )}
      {body && (
        <div style={{ fontFamily: `'${body}', sans-serif`, fontSize: 11 }}>
          The quick brown fox <span style={typoFaceLabelStyle}>{body}</span>
        </div>
      )}
      {mono && (
        <div style={{ fontFamily: `'${mono}', ui-monospace, monospace`, fontSize: 10 }}>
          {`{ }`} <span style={typoFaceLabelStyle}>{mono}</span>
        </div>
      )}
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
const sectionStyle: React.CSSProperties = { padding: '6px 12px 12px' }
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#888',
  margin: '6px 0 4px',
}
const rowStyle = (overridden: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  borderLeft: overridden ? '2px solid #2A4DFF' : '2px solid transparent',
  paddingLeft: 6,
  marginLeft: -8,
})
const rowLabelStyle: React.CSSProperties = {
  width: 100,
  flexShrink: 0,
  fontSize: 11,
  color: '#555',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const textInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '3px 6px',
  border: '1px solid #d8d8d8',
  borderRadius: 3,
  background: '#fff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
}
const swatchStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  padding: 0,
  border: '1px solid #d8d8d8',
  borderRadius: 3,
  cursor: 'pointer',
  flexShrink: 0,
  background: 'none',
}
const refChipStyle: React.CSSProperties = {
  flex: 1,
  padding: '3px 6px',
  border: '1px dashed #d8d8d8',
  borderRadius: 3,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  color: '#888',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const clearBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: '#888',
  padding: '0 4px',
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
const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  padding: '10px 12px',
  borderTop: '1px solid #e8e8e8',
  background: '#fff',
}
const errorBoxStyle: React.CSSProperties = {
  margin: '8px 12px',
  padding: '6px 8px',
  background: '#fff4f4',
  border: '1px solid #f3c0c0',
  borderRadius: 3,
  fontSize: 11,
  color: '#c33',
}
const ghostBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  fontSize: 11,
  background: '#fff',
  border: '1px solid #d8d8d8',
  borderRadius: 3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? '#bbb' : '#444',
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
})
const cardStyle: React.CSSProperties = {
  border: '1px solid #e3e2de',
  borderRadius: 4,
  marginBottom: 8,
  background: '#fff',
  overflow: 'hidden',
}
const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  borderBottom: '1px solid #f0f0ec',
  background: '#fafafa',
}
const tweakChipStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '2px 6px',
  background: '#2A4DFF',
  color: '#fff',
  borderRadius: 2,
}
const badgeStyle: React.CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '2px 5px',
  background: '#f2f1ee',
  color: '#666',
  borderRadius: 2,
}
const promptTextStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  color: '#666',
  fontStyle: 'italic',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const dismissBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  color: '#999',
  padding: '0 4px',
  lineHeight: 1,
  marginLeft: 'auto',
}
const variantRowStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  background: '#fff',
  border: 'none',
  borderTop: '1px solid #f0f0ec',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  color: 'inherit',
}
const variantNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#222',
}
const variantDescStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#777',
  marginTop: 2,
  lineHeight: 1.35,
}
const typoFaceLabelStyle: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  fontSize: 10,
  color: '#999',
  marginLeft: 6,
  fontWeight: 400,
}
const emptyHintStyle: React.CSSProperties = {
  padding: '8px 4px',
  fontSize: 11,
  color: '#888',
  lineHeight: 1.5,
}
const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  background: '#f2f1ee',
  padding: '1px 4px',
  borderRadius: 2,
  color: '#222',
}
