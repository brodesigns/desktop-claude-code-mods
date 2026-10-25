import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, ToolCallInput } from 'claude-code'

import type { AgentRow } from '../types'

import { refreshCounts } from './counts'
import { recordTurn } from './meter'
import { SITTING, SITTING_FAILED, WORKER } from './worker'
import { isNarrow } from './layout'
import { card, cardHead, emptyState, line, LIVE_MAX, more, SPACE, statusDot, tile, tiles, TONE, toolbar, TYPE } from './style'
import type { Tone } from './style'

const agents = atom({ plugin: 'bro-cockpit', key: 'agentList' } as const, [])
const now = atom({ plugin: 'bro-cockpit', key: 'agentNow' } as const, 0)
const viewMode = atom({ plugin: 'bro-cockpit', key: 'agentView' } as const, 'list')
const tab = atom({ plugin: 'bro-cockpit', key: 'cockpitTab' } as const, 'home')
const DONE_SHOWN = 8

const patch = (id: string, fn: (a: AgentRow) => AgentRow) => (list: AgentRow[]) =>
  list.map(a => (a.id === id ? fn(a) : a))

const secs = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

let timer: { cancel: () => void } | null = null

export async function start($: EngineInterface) {
  // The running clock only ticks while someone can see it: the Subagents tab is open and an agent runs.
  timer?.cancel()
  timer = $.clock.every(3000, async () => {
    if ((await read($, tab)) !== 'agents') return
    if ((await read($, agents)).some(a => !a.isDone)) await update($, now, () => Date.now())
  })
}

export async function countTool($: EngineInterface, e: ToolCallInput) {
  if (e.agentId !== undefined) {
    await update($, agents, patch(e.agentId, a => ({ ...a, tools: a.tools + 1, last: e.tool, isDone: false, isFailed: false, isAborted: false, endedAt: 0 })))
  }
}

export const register: Register = on => {
  on('agent.spawn', async ($, e, next) => {
    const res = await next(e)
    if (res.agentId !== undefined) {
      const t = await $.clock.now()
      const row: AgentRow = {
        id: res.agentId, type: e.subagentType, description: e.description, isBackground: e.background,
        isDone: false, isFailed: false, tools: 0, last: '', startedAt: t, endedAt: 0, parent: e.parentAgentId ?? '',
      }
      await update($, agents, list => [...list, row].slice(-30))
      await update($, now, () => t)
      await refreshCounts($)
    }

    return res
  })

  on('turn.complete', async ($, e, next) => {
    await recordTurn($, e)
    if (e.agentId !== undefined) {
      const t = await $.clock.now()
      await update($, agents, patch(e.agentId, a => ({ ...a, isDone: true, isFailed: e.reason === 'error' || e.reason === 'refusal', isAborted: e.isAborted, endedAt: t })))
      await refreshCounts($)
    }

    return next(e)
  })
}

// Only a working mascot animates; a sitting one is a still picture, which costs no frame of its own.
export async function worker($: EngineInterface, e: RenderInput, size: number, mood: 'work' | 'sit' | 'fail' = 'work', isLive = true) {
  const ui = $.ui.resolve(e)
  const { Text } = ui
  if (!('Svg' in ui)) return <Text color={mood === 'work' ? 'warning' : mood === 'sit' ? 'success' : 'error'}>{mood === 'work' ? '⚒' : mood === 'sit' ? '☕' : '✗'}</Text>
  const source = mood === 'work' ? WORKER : mood === 'sit' ? SITTING : SITTING_FAILED
  const alt = mood === 'work' ? 'Small worker, busy working' : mood === 'sit' ? 'Small worker sitting happily with a coffee' : 'Small worker sitting, exhausted'

  const height = Math.round((size * 80) / 90)
  if (mood !== 'work') return <ui.Svg source={source} alt={alt} width={size} height={height} />

  return <ui.Svg source={source} alt={alt} width={size} height={height} isInteractive={isLive} />
}

export async function summary($: EngineInterface) {
  const list = await read($, agents)

  return { running: list.filter(a => !a.isDone).length, total: list.length }
}

export async function running($: EngineInterface) {
  return (await read($, agents)).filter(a => !a.isDone).length
}

export async function isBusy($: EngineInterface) {
  return (await read($, agents)).some(a => !a.isDone)
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const list = await read($, agents)
  const t = (await read($, now)) || 0
  const finished = list.filter(a => a.isDone)
  const hidden = new Set(finished.slice(0, Math.max(0, finished.length - DONE_SHOWN)).map(a => a.id))
  const running = list.filter(a => !a.isDone).length
  const mode = await read($, viewMode)
  const byParent = (id: string) => list.filter(a => a.parent === id)
  const roots = list.filter(a => a.parent === '' || !list.some(x => x.id === a.parent))
  const narrow = isNarrow(e)
  const mascot = await worker($, e, narrow ? 44 : 64)
  // Beyond the animation budget a working mascot is the same picture, standing still.
  const mascotStill = await worker($, e, narrow ? 44 : 64, 'work', false)
  let liveLeft = LIVE_MAX
  const sitting = await worker($, e, narrow ? 38 : 52, 'sit')
  const tired = await worker($, e, narrow ? 38 : 52, 'fail')

  const toneOf = (a: AgentRow): Tone => (a.isDone ? (a.isFailed ? 'error' : a.isAborted ? 'warning' : 'success') : 'warning')
  const wordOf = (a: AgentRow) => (a.isDone ? (a.isFailed ? 'error' : a.isAborted ? 'stopped' : 'done') : 'running')
  const isCalm = (a: AgentRow) => a.isDone && !a.isFailed && a.isAborted !== true
  const age = (a: AgentRow) => secs((a.isDone ? a.endedAt : Math.max(t, a.startedAt)) - a.startedAt)

  // Tree: one card per agent, children indented under their parent.
  const branch = (a: AgentRow, depth: number): JSX.Element => (
    <Box key={`node-${a.id}`} flexDirection="column" gap={SPACE.tight} marginLeft={Math.min(depth, 4) * 2}>
      {card(ui, `nc-${a.id}`, isCalm(a) ? 'neutral' : toneOf(a), [
        cardHead(ui, 'h', [<Text key="tree" dimColor>└ </Text>, statusDot(ui, 'd', toneOf(a)), a.type], <Text dimColor tabular size={TYPE.label}>{wordOf(a)} · {age(a)} · {a.tools} tools</Text>),
        line(ui, 'desc', a.description, { size: 'caption' }),
      ])}
      {byParent(a.id).map(k => branch(k, depth + 1))}
    </Box>
  )

  const shown = list.filter(a => !hidden.has(a.id))

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {tiles(ui, 'agent-tiles', [
        tile(ui, String(running), 'running', running > 0 ? 'warning' : 'neutral'),
        tile(ui, String(list.length - running), 'done'),
        tile(ui, String(list.reduce((n, a) => n + a.tools, 0)), 'tools'),
      ])}
      {toolbar(ui, 'agent-bar', [
        <Button key="mode-list" label="List" variant={mode === 'list' ? 'primary' : 'secondary'} onPress={() => update($, viewMode, () => 'list')} />,
        <Button key="mode-tree" label="Tree" variant={mode === 'tree' ? 'primary' : 'secondary'} onPress={() => update($, viewMode, () => 'tree')} />,
      ])}
      {list.length === 0 && emptyState(ui, 'agents-empty', '◆', 'No subagents in this session yet.')}
      {mode === 'tree' && list.length > 0 && (
        <Box flexDirection="column" gap={SPACE.tight}>
          <Text weight="semibold" size={TYPE.body}><Text color="claude">◆ </Text>Main session</Text>
          {roots.map(a => branch(a, 1))}
        </Box>
      )}
      {mode === 'list' && more(ui, 'agents-more', hidden.size, 'more done (older)')}
      {mode === 'list' && shown.map(a => (
        <Box key={`agent-${a.id}`} borderStyle="round" overflow="hidden" borderColor={isCalm(a) ? 'subtle' : TONE[toneOf(a)]} paddingX="sm" paddingY="xs" gap={SPACE.base} alignItems="center">
          <Box flexShrink={0}>{a.isDone ? (a.isFailed ? tired : sitting) : liveLeft-- > 0 ? mascot : mascotStill}</Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            {cardHead(ui, 'h', [statusDot(ui, 'd', toneOf(a)), `${a.type}${a.isBackground ? ' · background' : ''}`], <Text dimColor tabular size={TYPE.label}>{age(a)}</Text>)}
            {line(ui, 'desc', a.description, { dim: false })}
            {line(ui, 'meta', `${wordOf(a)} · ${a.tools} tools${a.last !== '' && !a.isDone ? ` · last ${a.last}` : ''}`, { size: 'caption' })}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
