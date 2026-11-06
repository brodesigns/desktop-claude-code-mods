import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { InstalledItem, ToolStat, UsageEntry, UsageItems, UsageKind } from '../types'
import { buildInstalled, ofKind, tokenText, usedCount } from './inventory'
import { columns, isNarrow } from './layout'
import { ACCENT, actions, emptyState, SPACE, TYPE } from './style'
import { bumpTool, asToolStats, avg } from './toolstats'
import type { Outcome } from './toolstats'
import { ago, asItems, bump, mcpHits, rank, skillHits } from './usage'
import type { Hit } from './usage'

const PANE = 'usage-pane'
const STORE_KEY = 'usage'
const TOOLS_KEY = 'toolstats'

const TABS: { kind: UsageKind; label: string; empty: string }[] = [
  { kind: 'skill', label: 'Skills', empty: 'No skill used yet.' },
  { kind: 'plugin', label: 'Plugins', empty: 'No plugin used yet. A plugin counts when one of its skills or MCP servers runs.' },
  { kind: 'connector', label: 'Connectors', empty: 'No connector (MCP server) used yet.' },
]
const VIEWS = [
  { id: 'used', label: 'Used' },
  { id: 'unused', label: 'Unused' },
  { id: 'context', label: 'Context' },
  { id: 'tools', label: 'Tools' },
]

// Change the tag when a stored type's fields change: a value an earlier version stored is then declined.
const sessionItems = atom({ plugin: 'usage-pane', key: 'sessionItems' } as const, {}, { shape: 'usage-1' })
const allItems = atom({ plugin: 'usage-pane', key: 'allItems' } as const, {}, { shape: 'usage-1' })
const installed = atom({ plugin: 'usage-pane', key: 'installed' } as const, [], { shape: 'installed-1' })
const sessionTools = atom({ plugin: 'usage-pane', key: 'sessionTools' } as const, {}, { shape: 'tools-1' })
const allTools = atom({ plugin: 'usage-pane', key: 'allTools' } as const, {}, { shape: 'tools-1' })
const view = atom({ plugin: 'usage-pane', key: 'usageView' } as const, 'used')
const tab = atom({ plugin: 'usage-pane', key: 'usageTab' } as const, 'skill')
const scope = atom({ plugin: 'usage-pane', key: 'usageScope' } as const, 'session')
const sortBy = atom({ plugin: 'usage-pane', key: 'usageSort' } as const, 'most')
const info = atom({ plugin: 'usage-pane', key: 'usageInfo' } as const, false)
const confirmReset = atom({ plugin: 'usage-pane', key: 'usageConfirm' } as const, false)

// Store writes one after another: two reads of the store cannot overlap, and a reset is not undone by a count in flight.
let queue: Promise<unknown> = Promise.resolve()
function inOrder(job: () => Promise<void>): Promise<void> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)

  return run
}

// Counts waiting to reach the store. A call only changes the (in-memory) state; the store is written
// once per turn, at the end of the session, or when this many are waiting.
type PendingTool = { name: string; outcome: Outcome; ms: number }
const FLUSH_AT = 40
let pendingHits: { hits: Hit[]; at: number }[] = []
let pendingTools: PendingTool[] = []

// Counts the hits in this session and in the all-sessions state.
async function record($: EngineInterface, hits: Hit[]) {
  if (hits.length === 0) return
  const now = await $.clock.now()
  await update($, sessionItems, cur => bump(cur, hits, now))
  await update($, allItems, cur => bump(cur, hits, now))
  pendingHits.push({ hits, at: now })
  if (pendingHits.length + pendingTools.length >= FLUSH_AT) await flush($)
}

// One finished call of a built-in tool.
async function recordTool($: EngineInterface, name: string, outcome: Outcome, ms: number) {
  await update($, sessionTools, cur => bumpTool(cur, name, outcome, ms))
  await update($, allTools, cur => bumpTool(cur, name, outcome, ms))
  pendingTools.push({ name, outcome, ms })
  if (pendingHits.length + pendingTools.length >= FLUSH_AT) await flush($)
}

// Merges the waiting counts into the store: read it fresh, so another session's counts stay.
async function flush($: EngineInterface) {
  const hits = pendingHits
  const tools = pendingTools
  pendingHits = []
  pendingTools = []
  if (hits.length === 0 && tools.length === 0) return
  await inOrder(async () => {
    try {
      if (hits.length > 0) {
        let total = asItems(await $.store.get(STORE_KEY))
        for (const h of hits) total = bump(total, h.hits, h.at)
        await $.store.set(STORE_KEY, total)
        await update($, allItems, () => total)
      }
      if (tools.length > 0) {
        let total = asToolStats(await $.store.get(TOOLS_KEY))
        for (const t of tools) total = bumpTool(total, t.name, t.outcome, t.ms)
        await $.store.set(TOOLS_KEY, total)
        await update($, allTools, () => total)
      }
    } catch (err) {
      // Keep what was not saved for the next try (capped).
      pendingHits = [...hits, ...pendingHits].slice(-FLUSH_AT * 4)
      pendingTools = [...tools, ...pendingTools].slice(-FLUSH_AT * 4)
      throw err
    }
  })
}

async function load($: EngineInterface) {
  await inOrder(async () => {
    const stored = asItems(await $.store.get(STORE_KEY))
    await update($, allItems, () => stored)
    const tools = asToolStats(await $.store.get(TOOLS_KEY))
    await update($, allTools, () => tools)
  })
}

// What is installed, from the engine's own lists. Written only when it differs.
async function refresh($: EngineInterface) {
  const list = buildInstalled(await $.tool.list(), await $.command.list())
  const now = await read($, installed)
  if (JSON.stringify(now) === JSON.stringify(list)) return
  await update($, installed, () => list)
}

async function disarm($: EngineInterface) {
  if (await read($, confirmReset)) await update($, confirmReset, () => false)
}

async function resetAll($: EngineInterface) {
  const armed = await read($, confirmReset)
  if (!armed) return update($, confirmReset, () => true)
  pendingHits = []
  pendingTools = []
  await inOrder(async () => {
    await $.store.set(STORE_KEY, {})
    await $.store.set(TOOLS_KEY, {})
    await update($, allItems, () => ({}))
    await update($, allTools, () => ({}))
    await update($, confirmReset, () => false)
  })
}

// The limits of the numbers, shown behind "About these numbers".
const NOTES = [
  'Counting starts when this mod is installed, so a new entry can look unused for a while.',
  'Skills and prompt commands are listed. Commands a plugin registers in code are left out.',
  'Tokens are estimates from names and descriptions (about 4 characters a token). Tool schemas and tools loaded on demand are not counted.',
  'A plugin counts only through its skills and its own MCP servers. A plugin with only hooks never shows.',
  'Refused means refused by a hook. A call you reject at the permission prompt may show as failed.',
  'The lists of what is installed come from the engine and may differ from what you see in the app. Press refresh after connecting a server.',
]

type Ui = ReturnType<EngineInterface['ui']['resolve']>
type Cell = { text: string; width: number; color?: string; dim?: boolean; bold?: boolean }

const cut = (text: string, room: number) => (text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text)

// One row: the name takes the room, the cells sit right-aligned in fixed columns.
function line(ui: Ui, key: string, name: string, cells: Cell[], room: number) {
  const { Box, Text } = ui

  return (
    <Box key={key} alignItems="center" gap={SPACE.tight}>
      <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Text size={TYPE.body} wrap="truncate">{cut(name, room)}</Text>
      </Box>
      {cells.map((c, i) => (
        <Box key={`c${i}`} width={c.width} flexShrink={0} justifyContent="flex-end">
          <Text tabular size={TYPE.label} color={c.color} dimColor={c.dim} weight={c.bold ? 'semibold' : 'regular'}>{c.text}</Text>
        </Box>
      ))}
    </Box>
  )
}

const hint = (ui: Ui, key: string, text: string) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden">
      <Text dimColor size={TYPE.label} wrap="wrap">{text}</Text>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'toolusage', description: 'Show which skills, plugins, connectors and tools are used, in a pane' })
    try {
      await load($)
    } catch {
      // Only the all-sessions numbers are missing; the session counts still work.
    }
    try {
      await refresh($)
    } catch {
      // The inventory fills in at the refresh button.
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try {
      await flush($)
    } catch {
      // Tried again at the next turn.
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      await flush($)
    } catch {
      // The session is ending; the counts of this turn are lost.
    }

    return next(e)
  })

  on('command.run', { command: 'toolusage' }, async $ => {
    await disarm($).catch(() => undefined)
    try {
      await refresh($)
    } catch {
      // The pane still opens with what it has.
    }
    const res = await $.ui.open({ id: PANE, title: 'Usage' })

    return { text: res.isPlaced ? 'Usage opened.' : 'Usage: the pane is waiting for room.' }
  })

  // Skills: typed as /name or run by the Skill tool. A subagent's preloaded skills count too.
  on('skill.prompt', async ($, e, next) => {
    try {
      await record($, skillHits(e.skill, e.pluginName))
    } catch {
      // Only the pane misses it.
    }

    return next(e)
  })

  // Every tool call: an MCP tool counts for its connector (and plugin), any other for its tool statistics.
  on('tool.call', async ($, e, next) => {
    const started = await $.clock.now()
    let ran: Awaited<ReturnType<typeof next>> | null = null
    try {
      ran = await next(e)
    } finally {
      try {
        const name = typeof e.tool === 'string' ? e.tool : ''
        const denied = ran !== null && typeof ran.deny === 'string'
        if (name.startsWith('mcp__')) {
          if (!denied && ran !== null) {
            const known = (await read($, installed)).filter(x => x.kind === 'plugin').map(x => x.name)
            await record($, mcpHits(name, known))
          }
        } else if (name !== '') {
          const outcome: Outcome = denied ? 'denied' : ran === null || ran.isError === true ? 'failed' : 'ok'
          await recordTool($, name, outcome, (await $.clock.now()) - started)
        }
      } catch {
        // The call's result stands; only the pane misses it.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui: Ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const v = await read($, view)
    const t = await read($, tab)
    const sc = await read($, scope)
    const sort = await read($, sortBy)
    const armed = await read($, confirmReset)
    const infoOpen = await read($, info)
    const stock = v === 'unused' || v === 'context'
    const all: UsageItems = stock || (v === 'used' && sc === 'all') ? await read($, allItems) : {}
    const items: UsageItems = v !== 'used' ? {} : sc === 'all' ? all : await read($, sessionItems)
    const have: InstalledItem[] = stock ? await read($, installed) : []
    const now = await $.clock.now()
    const narrow = isNarrow(e as unknown as RenderInput)
    const width = columns(e as unknown as RenderInput)
    const current = TABS.find(x => x.kind === t) ?? TABS[0]!
    const room = Math.max(8, width - 22)

    // Installed things nobody used (all sessions), the biggest first.
    const unusedOf = (kind: UsageKind): InstalledItem[] => ofKind(have, kind).filter(x => usedCount(all, x) === 0).sort((a, b) => b.tokens - a.tokens)
    const kindCount = (kind: UsageKind): number =>
      v === 'unused' ? unusedOf(kind).length : v === 'context' ? ofKind(have, kind).length : Object.values(items).filter(i => i.kind === kind).length

    let body: unknown[] = []
    if (v === 'used') {
      const list = rank(items, current.kind, sort)
      const row = (x: UsageEntry) =>
        line(ui, `r-${x.kind}-${x.name}`, x.name, [{ text: `${x.n}×`, width: 5, bold: true }, ...(sc === 'all' ? [{ text: ago(now, x.last), width: 5, dim: true }] : [])], room)
      body = [
        <Box key="sort" justifyContent="flex-end">
          <Button key="sort-btn" plain onPress={() => update($, sortBy, s => (s === 'least' ? 'most' : 'least'))}>
            <Text size={TYPE.label} color={ACCENT}>{sort === 'least' ? '↑ least used first' : '↓ most used first'}</Text>
          </Button>
        </Box>,
        list.length === 0
          ? emptyState(ui, 'empty', '∅', sc === 'all' && Object.keys(items).length === 0 ? 'Nothing recorded yet. Counting starts when this mod is installed.' : current.empty)
          : <Box key="list" flexDirection="column" gap={SPACE.tight}>{list.map(row)}</Box>,
      ]
    } else if (v === 'unused') {
      const list = unusedOf(current.kind)
      body = [
        hint(ui, 'h', 'Installed, never used since this mod counts. Biggest context cost first.'),
        have.length === 0
          ? emptyState(ui, 'empty', '∅', 'Nothing read yet. Press refresh.')
          : list.length === 0
            ? emptyState(ui, 'empty', '✓', 'Everything of this kind was used.')
            : <Box key="list" flexDirection="column" gap={SPACE.tight}>{list.map(x => line(ui, `u-${x.kind}-${x.name}`, x.name, [{ text: tokenText(x.tokens), width: 7, dim: true }], room))}</Box>,
      ]
    } else if (v === 'context') {
      const list = ofKind(have, current.kind).sort((a, b) => b.tokens - a.tokens)
      const sum = list.reduce((s, x) => s + x.tokens, 0)
      body = [
        hint(ui, 'h', `${tokenText(sum)} tokens of names and descriptions in this list (estimate, about 4 characters a token). Used = all sessions.`),
        list.length === 0
          ? emptyState(ui, 'empty', '∅', have.length === 0 ? 'Nothing read yet. Press refresh.' : 'Nothing installed of this kind.')
          : (
            <Box key="list" flexDirection="column" gap={SPACE.tight}>
              {list.map(x => {
                const n = usedCount(all, x)
                return line(ui, `x-${x.kind}-${x.name}`, x.name, [{ text: tokenText(x.tokens), width: 7, dim: true }, { text: `${n}×`, width: 5, bold: n > 0, color: n === 0 ? 'warning' : undefined }], room)
              })}
            </Box>
          ),
      ]
    } else {
      const stats = Object.values(sc === 'all' ? await read($, allTools) : await read($, sessionTools)).sort((a, b) => b.n - a.n)
      const failedAll = stats.reduce((s, x) => s + x.failed, 0)
      const row = (x: ToolStat) =>
        line(ui, `t-${x.name}`, x.denied > 0 ? `${x.name} (⊘ ${x.denied})` : x.name, [
          { text: `${x.n}×`, width: 6, bold: true },
          { text: x.failed > 0 ? `✗ ${x.failed}` : '·', width: 5, color: x.failed > 0 ? 'error' : undefined, dim: x.failed === 0 },
          ...(narrow ? [] : [{ text: avg(x), width: 7, dim: true }]),
        ], room)
      body = [
        hint(ui, 'h', `Built-in tools: calls · ✗ failed${narrow ? '' : ' · average time (includes waiting for approval)'} · ⊘ refused by a hook. ${failedAll} failed in total.`),
        stats.length === 0 ? emptyState(ui, 'empty', '∅', 'No tool call recorded yet.') : <Box key="list" flexDirection="column" gap={SPACE.tight}>{stats.map(row)}</Box>,
      ]
    }

    return (
      <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
        <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
          <Box flexShrink={0}>
            <Text size={TYPE.title} weight="semibold">Usage</Text>
          </Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end" gap={SPACE.base}>
            {(v === 'unused' || v === 'context') && (
              <Button key="refresh" plain onPress={() => refresh($).catch(() => undefined)}>
                <Text size={TYPE.label} color={ACCENT} weight="semibold">↻ refresh</Text>
              </Button>
            )}
            {(v === 'used' || v === 'tools') && (
              <Button key="scope" plain onPress={() => disarm($).then(() => update($, scope, s => (s === 'all' ? 'session' : 'all')))}>
                <Text size={TYPE.label} color={ACCENT} weight="semibold">{sc === 'all' ? 'all sessions' : 'this session'}</Text>
              </Button>
            )}
          </Box>
        </Box>
        <Box key="views" gap={SPACE.base} flexWrap="wrap">
          {VIEWS.map(x => (
            <Button key={`view-${x.id}`} plain onPress={() => disarm($).then(() => update($, view, () => x.id))}>
              <Text size={TYPE.body} weight={x.id === v ? 'bold' : 'regular'} color={x.id === v ? ACCENT : undefined}>{x.label}</Text>
            </Button>
          ))}
        </Box>
        {v !== 'tools' && (
          <Box key="tabs" gap={SPACE.base} flexWrap="wrap">
            {TABS.map(x => (
              <Button key={`tab-${x.kind}`} plain onPress={() => disarm($).then(() => update($, tab, () => x.kind))}>
                <Text size={TYPE.label} weight={x.kind === current.kind ? 'bold' : 'regular'} color={x.kind === current.kind ? ACCENT : undefined}>{`${x.label} ${kindCount(x.kind)}`}</Text>
              </Button>
            ))}
          </Box>
        )}
        {body as never}
        <Box key="info-row">
          <Button key="info" plain onPress={() => update($, info, o => !o)}>
            <Text size={TYPE.label} color={ACCENT}>{infoOpen ? 'ⓘ hide notes' : 'ⓘ About these numbers'}</Text>
          </Button>
        </Box>
        {infoOpen && (
          <Box key="notes" flexDirection="column" gap={SPACE.tight} borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs">
            {NOTES.map((n, i) => (
              <Text key={`n${i}`} dimColor size={TYPE.label} wrap="wrap">{`• ${n}`}</Text>
            ))}
          </Box>
        )}
        {sc === 'all' && (v === 'used' || v === 'tools') &&
          actions(ui, 'tools-row', [
            <Button key="reset" label={armed ? 'Really reset all counts?' : 'Reset all'} variant="secondary" onPress={() => resetAll($)} />,
            ...(armed ? [<Button key="cancel" label="Cancel" variant="secondary" onPress={() => update($, confirmReset, () => false)} />] : []),
          ])}
      </Box>
    )
  })
}
