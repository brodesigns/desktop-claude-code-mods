import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput, ToolCallInput, ToolCallResult } from 'claude-code'

import type { Call } from '../types'
import { noteCall, refreshCounts } from './counts'
import { printable, redact } from './keys'
import { isNarrow } from './layout'
import { isFailed } from './status'
import { card, emptyState, HEX, legend, LIVE_MAX, more, SPACE, tile, tiles, toolbar, TYPE } from './style'

const calls = atom({ plugin: 'bro-cockpit', key: 'callList' } as const, [])
const filter = atom({ plugin: 'bro-cockpit', key: 'toolFilter' } as const, 'all')
const opened = atom({ plugin: 'bro-cockpit', key: 'toolOpen' } as const, [])
const agentList = atom({ plugin: 'bro-cockpit', key: 'agentList' } as const, [])

const META: Record<string, { icon: string; color: string }> = {
  Bash: { icon: '⌘', color: 'warning' },
  Edit: { icon: '✎', color: 'suggestion' },
  MultiEdit: { icon: '✎', color: 'suggestion' },
  Write: { icon: '✎', color: 'suggestion' },
  NotebookEdit: { icon: '✎', color: 'suggestion' },
  Read: { icon: '▤', color: 'remember' },
  Grep: { icon: '⌕', color: 'remember' },
  Glob: { icon: '⌕', color: 'remember' },
  WebFetch: { icon: '◍', color: 'permission' },
  WebSearch: { icon: '◍', color: 'permission' },
  Agent: { icon: '◆', color: 'claude' },
}
const FILE_TOOLS = new Set(['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Glob', 'Grep'])
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'errors', label: 'Errors' },
  { id: 'bash', label: 'Bash' },
  { id: 'files', label: 'Files' },
  { id: 'agents', label: 'Agents' },
] as const

// Working: a gear turns. Done: the tick draws itself. Failed: the cross shakes. Pure SMIL, no redraw needed.
const TEETH = [0, 45, 90, 135, 180, 225, 270, 315]
  .map(k => `<rect x="6" y="0.4" width="2" height="3.2" rx="0.8" fill="${HEX.warning}" transform="rotate(${k} 7 7)"/>`)
  .join('')
const GEAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><g>' +
  '<animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="1.6s" repeatCount="indefinite"/>' +
  `<circle cx="7" cy="7" r="3.4" fill="none" stroke="${HEX.warning}" stroke-width="2.2"/>${TEETH}</g></svg>`
const CHECK =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><path d="M3 7.5l3 3 5-6" fill="none" stroke="${HEX.success}" stroke-width="2.2" ` +
  'stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14" stroke-dashoffset="14">' +
  '<animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.35s" fill="freeze"/></path></svg>'
const CROSS =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><g stroke="${HEX.error}" stroke-width="2.2" stroke-linecap="round">` +
  '<path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/>' +
  '<animateTransform attributeName="transform" type="translate" values="0 0;-1.6 0;1.6 0;-1.6 0;1.6 0;0 0" dur="0.45s" fill="freeze"/></g></svg>'

const ARG_KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']

const pick = (input: Record<string, unknown>): string => {
  for (const key of ARG_KEYS) {
    const v = input[key]
    if (typeof v === 'string' && v !== '') return v
  }
  return ''
}

const lineCount = (v: unknown) => (typeof v === 'string' && v !== '' ? v.split('\n').length : 0)

const short = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

const MAX_CALLS = 150

// Over the cap the oldest call that finished without failing goes first, so failed calls stay in the Errors tab
// as long as possible; only a list of nothing but failures and running calls loses its oldest entry.
function trim(list: Call[]): Call[] {
  if (list.length <= MAX_CALLS) return list
  const at = list.findIndex(c => c.isDone && !isFailed(c))

  return list.filter((_, i) => i !== (at >= 0 ? at : 0))
}

export async function begin($: EngineInterface, e: ToolCallInput): Promise<Call> {
  const t = await $.clock.now()
  const input = e as unknown as Record<string, unknown>
  // Secrets never reach the state: commands are redacted before they are kept or shown.
  const full = printable(redact(pick(input)))
  const call: Call = {
    id: e.tool_use_id,
    tool: e.tool,
    arg: full.replace(/\s+/g, ' ').slice(0, 90),
    detail: full.slice(0, 300),
    lines: lineCount(input.new_string ?? input.content),
    note: '',
    isDone: false,
    isError: false,
    isDenied: false,
    startedAt: t,
    ms: 0,
    agent: e.agentId !== undefined,
    agentId: e.agentId ?? '',
  }
  noteCall()
  await update($, calls, list => trim([...list, call]))

  return call
}

export async function finish($: EngineInterface, call: Call, ran: ToolCallResult) {
  const ms = (await $.clock.now()) - call.startedAt
  // A call denied by a hook (for example a guard mod) is not a tool error.
  const isDenied = ran.deny !== undefined
  const isError = ran.isError === true && !isDenied
  const result = (ran as { result?: unknown }).result as Record<string, unknown> | undefined
  let note = typeof ran.deny === 'string' ? printable(redact(ran.deny)).slice(0, 160) : ''
  if (note === '' && result !== undefined && result !== null) {
    if (result.interrupted === true) note = 'interrupted'
    else if (typeof result.stderr === 'string' && result.stderr.trim() !== '') note = printable(redact(result.stderr.trim().split('\n')[0] ?? '')).slice(0, 160)
  }
  await update($, calls, list => list.map(c => (c.id === call.id ? { ...c, isDone: true, isError, isDenied, ms, note } : c)))
}

export async function count($: EngineInterface) {
  return (await read($, calls)).length
}

export async function summary($: EngineInterface) {
  const list = await read($, calls)

  return { total: list.length, failed: list.filter(c => c.isError).length }
}

type Group = { key: string; items: Call[] }

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const all = await read($, calls)
  const f = await read($, filter)
  const open = await read($, opened)
  const agents = await read($, agentList)
  const narrow = isNarrow(e)
  const room = Math.max(5, Math.floor((e.viewport?.rows ?? 40) - 10))

  const pass = (c: Call) =>
    f === 'all' || (f === 'errors' && (c.isError || c.isDenied === true)) || (f === 'bash' && c.tool === 'Bash') || (f === 'files' && FILE_TOOLS.has(c.tool)) || (f === 'agents' && c.agent)
  const list = all.filter(pass)
  const failed = all.filter(c => c.isError).length
  const toggle = (id: string) => update($, opened, l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id].slice(-60)))
  const label = (c: Call) => agents.find(a => a.id === c.agentId)?.type ?? 'agent'

  const groups: Group[] = []
  for (const c of list) {
    const last = groups[groups.length - 1]
    const head = last?.items[0]
    if (last !== undefined && head !== undefined && head.tool === c.tool && head.agent === c.agent && head.isDone && c.isDone) last.items.push(c)
    else groups.push({ key: c.id, items: [c] })
  }

  const fresh = new Set(all.slice(-3).map(c => c.id))
  // Animation budget: running gears first (newest), then the result marks of the newest calls.
  const animated = new Set(all.filter(c => !c.isDone).slice(-LIVE_MAX).map(c => c.id))
  for (const id of [...fresh].reverse()) if (animated.size < LIVE_MAX) animated.add(id)
  const dot = (c: Call) => {
    if (c.isDenied === true) return <Text color="warning" weight="bold">⛨</Text>
    const glyph = <Text color={c.isError ? 'error' : 'success'} weight="bold">{c.isError ? '✗' : '✓'}</Text>
    if (!('Svg' in ui)) return c.isDone ? glyph : <Text color="warning">⚙</Text>
    if (!c.isDone) return <ui.Svg source={GEAR} alt="Call running" width={14} height={14} isInteractive={animated.has(c.id)} />
    // Only the newest calls animate their result; older rows stay a plain glyph so the pane stays light.
    if (!fresh.has(c.id) || !animated.has(c.id)) return glyph

    return <ui.Svg source={c.isError ? CROSS : CHECK} alt={c.isError ? 'Call failed' : 'Call done'} width={14} height={14} isInteractive />
  }

  const meta = (tool: string) => META[tool] ?? { icon: '•', color: 'text' }
  // Fixed columns for every row and group: status, tool, argument (gives way), time.
  const COL = { mark: 3, tool: narrow ? 11 : 14, time: 7 }

  // One line per call, in fixed columns: status, tool, argument, time.
  const row = (c: Call, indent: boolean) => {
    const m = meta(c.tool)
    const isOpen = open.includes(c.id)

    return (
      <Box key={`call-${c.id}`} flexDirection="column">
        <Box alignItems="center" gap={SPACE.base} paddingLeft={indent ? 'lg' : 0}>
          <Box width={COL.mark} flexShrink={0}>{dot(c)}</Box>
          <Box width={COL.tool} flexShrink={0} overflow="hidden">
            <Button key={`t-${c.id}`} plain label={`${c.agent ? '▌' : ''}${m.icon} ${c.tool}`} onPress={() => toggle(c.id)} />
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Text dimColor mono size={TYPE.label} wrap="truncate">{c.arg}</Text>
          </Box>
          <Box width={COL.time} flexShrink={0} justifyContent="flex-end">
            <Text dimColor tabular size={TYPE.label}>{c.isDone ? short(c.ms) : '…'}</Text>
          </Box>
        </Box>
        {isOpen && (
          <Box flexDirection="column" marginLeft="xl" marginY="xs" paddingX="sm" borderStyle="round" overflow="hidden" borderColor={c.isError ? 'error' : c.isDenied === true ? 'warning' : 'subtle'}>
            <Text mono size={TYPE.label} wrap="wrap">{c.detail !== '' ? c.detail : '(no arguments)'}</Text>
            {c.agent && <Text dimColor size={TYPE.label}>Agent: {label(c)}</Text>}
            {c.lines > 0 && <Text dimColor size={TYPE.label}>{c.lines} lines</Text>}
            {c.note !== '' && <Text color={c.isError ? 'error' : c.isDenied === true ? 'warning' : undefined} size={TYPE.label} wrap="wrap">{c.note}</Text>}
          </Box>
        )}
      </Box>
    )
  }

  const block = (g: Group) => {
    const first = g.items[0]
    if (first === undefined) return null
    if (g.items.length === 1) return row(first, false)
    const m = meta(first.tool)
    const isOpen = open.includes(g.key)
    const total = g.items.reduce((sum, c) => sum + c.ms, 0)
    const bad = g.items.filter(c => c.isError).length

    return (
      <Box key={`grp-${g.key}`} flexDirection="column">
        <Box alignItems="center" gap={SPACE.base}>
          <Box width={COL.mark} flexShrink={0}>
            <Text color={bad > 0 ? 'error' : 'success'} weight="bold">{bad > 0 ? '✗' : '✓'}</Text>
          </Box>
          <Box width={COL.tool} flexShrink={0} overflow="hidden">
            <Button key={`g-${g.key}`} plain label={`${isOpen ? '▾' : '▸'} ${m.icon} ${first.tool}`} onPress={() => toggle(g.key)} />
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Text dimColor size={TYPE.label} wrap="truncate">{g.items.length} calls{bad > 0 ? `, ${bad} ${bad === 1 ? 'error' : 'errors'}` : ''}</Text>
          </Box>
          <Box width={COL.time} flexShrink={0} justifyContent="flex-end">
            <Text dimColor tabular size={TYPE.label}>{short(total)}</Text>
          </Box>
        </Box>
        {isOpen && g.items.map(c => row(c, true))}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {tiles(ui, 'call-tiles', [
        tile(ui, String(all.length), 'calls'),
        tile(ui, String(failed), 'errors', failed > 0 ? 'error' : 'neutral'),
        tile(ui, String(all.filter(c => c.agent).length), 'by agents'),
      ])}
      {toolbar(
        ui,
        'call-bar',
        FILTERS.map(x => (
          <Button
            key={`f-${x.id}`}
            label={x.id === 'errors' && failed > 0 ? `${x.label} ${failed}` : x.label}
            variant={x.id === f ? 'primary' : 'secondary'}
            onPress={() => update($, filter, () => x.id)}
          />
        )),
        [
          <Button key="latest" label="↓ Newest" variant="secondary" onPress={() => $.ui.scroll({ in: 'bro-cockpit', to: 'end' })} />,
          <Button key="clear" label="Clear" variant="secondary" onPress={async () => {
            await update($, calls, () => [])
            await refreshCounts($)
          }} />,
        ],
      )}
      {list.length === 0 && (all.length === 0
        ? emptyState(ui, 'calls-empty', '⌘', 'No tool calls in this session yet.')
        : emptyState(ui, 'calls-none', '⌕', 'Nothing for this filter.'))}
      {more(ui, 'calls-more', Math.max(0, groups.length - room), 'older rows hidden')}
      {groups.length > 0 && card(ui, 'calls', 'neutral', groups.slice(-room).map(g => block(g)))}
      {all.length > 0 && legend(ui, 'calls-legend', '✓ done · ✗ error · ⛨ blocked · ▌ subagent · click a tool for details')}
    </Box>
  )
}
