import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, ToolCallResult } from 'claude-code'

import type { InstalledItem, ToolStat, UsageEntry, UsageItems, UsageKind } from '../types'
import { buildInstalled, ofKind, tokenText, usedCount } from './inventory'
import { columns, isNarrow } from './layout'
import { card, emptyState, legend, sectionTitle, SPACE, tile, tiles, toolbar, TYPE } from './style'
import { asToolStats, avg, bumpTool } from './toolstats'
import type { Outcome } from './toolstats'
import { ago, asItems, bump, mcpHits, rank, skillHits } from './usage'
import type { Hit } from './usage'

// The Usage tab: what is used, what never is and what it costs. Counts skills, plugins, connectors and built-in tools.
const STORE_KEY = 'usage'
const TOOLS_KEY = 'toolstats'

const KINDS: { kind: UsageKind; label: string; empty: string }[] = [
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
const sessionItems = atom({ plugin: 'bro-cockpit', key: 'usageSession' } as const, {}, { shape: 'usage-1' })
const allItems = atom({ plugin: 'bro-cockpit', key: 'usageAll' } as const, {}, { shape: 'usage-1' })
const installed = atom({ plugin: 'bro-cockpit', key: 'usageInstalled' } as const, [], { shape: 'installed-1' })
const sessionTools = atom({ plugin: 'bro-cockpit', key: 'usageToolsSession' } as const, {}, { shape: 'tools-1' })
const allTools = atom({ plugin: 'bro-cockpit', key: 'usageToolsAll' } as const, {}, { shape: 'tools-1' })
const view = atom({ plugin: 'bro-cockpit', key: 'usageView' } as const, 'used')
const kindTab = atom({ plugin: 'bro-cockpit', key: 'usageKind' } as const, 'skill')
const scope = atom({ plugin: 'bro-cockpit', key: 'usageScope' } as const, 'session')
const sortBy = atom({ plugin: 'bro-cockpit', key: 'usageSort' } as const, 'most')
const info = atom({ plugin: 'bro-cockpit', key: 'usageInfo' } as const, false)
const confirmReset = atom({ plugin: 'bro-cockpit', key: 'usageConfirm' } as const, false)

// Store writes one after another: two reads of the store cannot overlap, and a reset is not undone by a count in flight.
let queue: Promise<unknown> = Promise.resolve()
function inOrder(job: () => Promise<void>): Promise<void> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)

  return run
}

// Counts waiting to reach the store: a call only changes the in-memory state; the store is written once
// per turn, at the end of the session, or when this many are waiting.
type PendingTool = { name: string; outcome: Outcome; ms: number }
const FLUSH_AT = 40
let pendingHits: { hits: Hit[]; at: number }[] = []
let pendingTools: PendingTool[] = []

async function record($: EngineInterface, hits: Hit[]) {
  if (hits.length === 0) return
  const now = await $.clock.now()
  await update($, sessionItems, cur => bump(cur, hits, now))
  await update($, allItems, cur => bump(cur, hits, now))
  pendingHits.push({ hits, at: now })
  if (pendingHits.length + pendingTools.length >= FLUSH_AT) await flushUsage($)
}

async function recordTool($: EngineInterface, name: string, outcome: Outcome, ms: number) {
  await update($, sessionTools, cur => bumpTool(cur, name, outcome, ms))
  await update($, allTools, cur => bumpTool(cur, name, outcome, ms))
  pendingTools.push({ name, outcome, ms })
  if (pendingHits.length + pendingTools.length >= FLUSH_AT) await flushUsage($)
}

// Merges the waiting counts into the store: read it fresh, so another session's counts stay.
export async function flushUsage($: EngineInterface) {
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

// What is installed, from the engine's own lists. Written only when it differs.
async function refresh($: EngineInterface) {
  const list = buildInstalled(await $.tool.list(), await $.command.list())
  if (JSON.stringify(await read($, installed)) === JSON.stringify(list)) return
  await update($, installed, () => list)
}

// Session start: the stored all-sessions numbers and the installed list. A failure only leaves the tab emptier.
export async function startUsage($: EngineInterface) {
  try {
    await inOrder(async () => {
      const stored = asItems(await $.store.get(STORE_KEY))
      await update($, allItems, () => stored)
      const tools = asToolStats(await $.store.get(TOOLS_KEY))
      await update($, allTools, () => tools)
    })
  } catch {
    // Only the all-sessions numbers are missing.
  }
  try {
    await refresh($)
  } catch {
    // The inventory fills in at the refresh button.
  }
}

// One finished tool call. `ran` is null when the call itself threw.
export async function countUsage($: EngineInterface, tool: unknown, ran: ToolCallResult | null, ms: number) {
  try {
    const name = typeof tool === 'string' ? tool : ''
    const denied = ran !== null && typeof ran.deny === 'string'
    if (name.startsWith('mcp__')) {
      if (!denied && ran !== null) {
        const known = (await read($, installed)).filter(x => x.kind === 'plugin').map(x => x.name)
        await record($, mcpHits(name, known))
      }
    } else if (name !== '') {
      const outcome: Outcome = denied ? 'denied' : ran === null || ran.isError === true ? 'failed' : 'ok'
      await recordTool($, name, outcome, ms)
    }
  } catch {
    // The call's result stands; only the tab misses it.
  }
}

async function disarm($: EngineInterface) {
  if (await read($, confirmReset)) await update($, confirmReset, () => false)
}

async function resetAll($: EngineInterface) {
  if (!(await read($, confirmReset))) return update($, confirmReset, () => true)
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

// Skills (typed as /name or run by the Skill tool) and the end of the session.
export const register: Register = (on, options) => {
  if (options.show_usage === false) return

  on('skill.prompt', async ($, e, next) => {
    try {
      await record($, skillHits(e.skill, e.pluginName))
    } catch {
      // Only the tab misses it.
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      await flushUsage($)
    } catch {
      // The session is ending; the counts of this turn are lost.
    }

    return next(e)
  })
}

// The limits of the numbers, shown behind "About these numbers".
const NOTES = [
  'Counting starts when this tab is on, so a new entry can look unused for a while.',
  'Skills and prompt commands are listed. Commands a plugin registers in code are left out.',
  'Tokens are estimates from names and descriptions (about 4 characters a token). Tool schemas and tools loaded on demand are not counted.',
  'A plugin counts only through its skills and its own MCP servers. A plugin with only hooks never shows.',
  'Refused means refused by a hook. A call you reject at the permission prompt may show as failed.',
]

type Ui = ReturnType<EngineInterface['ui']['resolve']>
type Cell = { text: string; width: number; color?: string; dim?: boolean; bold?: boolean }

const cut = (text: string, room: number) => (text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text)

// One row: the name takes the room, the cells sit right-aligned in fixed columns.
function row(ui: Ui, key: string, name: string, cells: Cell[], room: number) {
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

export async function usageView($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const v = await read($, view)
  const t = await read($, kindTab)
  const sc = await read($, scope)
  const sort = await read($, sortBy)
  const armed = await read($, confirmReset)
  const infoOpen = await read($, info)
  const stock = v === 'unused' || v === 'context'
  const all: UsageItems = stock || (v === 'used' && sc === 'all') ? await read($, allItems) : {}
  const items: UsageItems = v !== 'used' ? {} : sc === 'all' ? all : await read($, sessionItems)
  const have: InstalledItem[] = stock ? await read($, installed) : []
  const now = await $.clock.now()
  const narrow = isNarrow(e)
  const current = KINDS.find(x => x.kind === t) ?? KINDS[0]!
  const room = Math.max(8, columns(e) - 22)

  // Installed things nobody used (all sessions), the biggest first.
  const unusedOf = (kind: UsageKind): InstalledItem[] => ofKind(have, kind).filter(x => usedCount(all, x) === 0).sort((a, b) => b.tokens - a.tokens)
  const kindCount = (kind: UsageKind): number =>
    v === 'unused' ? unusedOf(kind).length : v === 'context' ? ofKind(have, kind).length : Object.values(items).filter(i => i.kind === kind).length

  let body: unknown[] = []
  if (v === 'used') {
    const list = rank(items, current.kind, sort)
    const line = (x: UsageEntry) =>
      row(ui, `r-${x.kind}-${x.name}`, x.name, [{ text: `${x.n}×`, width: 5, bold: true }, ...(sc === 'all' ? [{ text: ago(now, x.last), width: 5, dim: true }] : [])], room)
    body = [
      list.length === 0
        ? emptyState(ui, 'usage-empty', '∅', sc === 'all' && Object.keys(items).length === 0 ? 'Nothing recorded yet. Counting starts when this tab is on.' : current.empty)
        : card(ui, 'usage-list', 'neutral', list.map(line)),
    ]
  } else if (v === 'unused') {
    const list = unusedOf(current.kind)
    body = [
      have.length === 0
        ? emptyState(ui, 'usage-empty', '∅', 'Nothing read yet. Press refresh.')
        : list.length === 0
          ? emptyState(ui, 'usage-empty', '✓', 'Everything of this kind was used.', 'success')
          : card(ui, 'usage-list', 'neutral', list.map(x => row(ui, `u-${x.kind}-${x.name}`, x.name, [{ text: tokenText(x.tokens), width: 7, dim: true }], room))),
    ]
  } else if (v === 'context') {
    const list = ofKind(have, current.kind).sort((a, b) => b.tokens - a.tokens)
    const sum = list.reduce((s, x) => s + x.tokens, 0)
    body = [
      list.length === 0
        ? emptyState(ui, 'usage-empty', '∅', have.length === 0 ? 'Nothing read yet. Press refresh.' : 'Nothing installed of this kind.')
        : card(ui, 'usage-list', 'neutral', list.map(x => {
          const n = usedCount(all, x)
          return row(ui, `x-${x.kind}-${x.name}`, x.name, [{ text: tokenText(x.tokens), width: 7, dim: true }, { text: `${n}×`, width: 5, bold: n > 0, color: n === 0 ? 'warning' : undefined }], room)
        })),
    ]
  } else {
    const stats = Object.values(sc === 'all' ? await read($, allTools) : await read($, sessionTools)).sort((a, b) => b.n - a.n)
        const line = (x: ToolStat) =>
      row(ui, `t-${x.name}`, x.denied > 0 ? `${x.name} (⊘ ${x.denied})` : x.name, [
        { text: `${x.n}×`, width: 6, bold: true },
        { text: x.failed > 0 ? `✗ ${x.failed}` : '·', width: 5, color: x.failed > 0 ? 'error' : undefined, dim: x.failed === 0 },
        ...(narrow ? [] : [{ text: avg(x), width: 7, dim: true }]),
      ], room)
    body = [
      stats.length === 0 ? emptyState(ui, 'usage-empty', '⌘', 'No tool call recorded yet.') : card(ui, 'usage-list', 'neutral', stats.map(line)),
    ]
  }

  const sum = (list: InstalledItem[]) => list.reduce((n, x) => n + x.tokens, 0)
  const toolStats = v === 'tools' ? Object.values(sc === 'all' ? await read($, allTools) : await read($, sessionTools)) : []
  const shownItems = v === 'used' ? Object.values(items).filter(i => i.kind === current.kind) : []
  const shownHave = ofKind(have, current.kind)
  const failed = toolStats.reduce((n, x) => n + x.failed, 0)
  const refused = toolStats.reduce((n, x) => n + x.denied, 0)
  const stats4 =
    v === 'used' ? [tile(ui, String(shownItems.length), current.label.toLowerCase()), tile(ui, String(shownItems.reduce((n, x) => n + x.n, 0)), 'uses')]
    : v === 'unused' ? [tile(ui, String(unusedOf(current.kind).length), 'never used', unusedOf(current.kind).length > 0 ? 'warning' : 'success'), tile(ui, tokenText(sum(unusedOf(current.kind))), 'tokens to save')]
    : v === 'context' ? [tile(ui, String(shownHave.length), 'installed'), tile(ui, tokenText(sum(shownHave)), 'tokens')]
    : [tile(ui, String(toolStats.reduce((n, x) => n + x.n, 0)), 'calls'), tile(ui, String(failed), 'failed', failed > 0 ? 'error' : 'neutral'), tile(ui, String(refused), 'refused', refused > 0 ? 'warning' : 'neutral')]
  const legendText =
    v === 'used' ? 'Counted since the tab was switched on. A plugin counts through its skills and MCP servers.'
    : v === 'unused' ? 'Installed, never used. Biggest context cost first. Press refresh after connecting a server.'
    : v === 'context' ? 'Estimate: about 4 characters a token, names and descriptions only. 0× in yellow costs context and is never used.'
    : `Built-in tools: calls · ✗ failed${narrow ? '' : ' · average time (includes waiting for approval)'} · ⊘ refused by a hook.`

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {tiles(ui, 'usage-tiles', stats4)}
      {toolbar(
        ui,
        'usage-views',
        VIEWS.map(x => <Button key={`view-${x.id}`} label={x.label} variant={x.id === v ? 'primary' : 'secondary'} onPress={() => disarm($).then(() => update($, view, () => x.id))} />),
        [
          ...(v === 'used' || v === 'tools'
            ? [<Button key="scope" label={sc === 'all' ? 'All sessions' : 'This session'} variant="secondary" onPress={() => disarm($).then(() => update($, scope, s => (s === 'all' ? 'session' : 'all')))} />]
            : [<Button key="refresh" label="↻ Refresh" variant="secondary" onPress={() => refresh($).catch(() => undefined)} />]),
        ],
      )}
      {v !== 'tools' &&
        toolbar(
          ui,
          'usage-kinds',
          KINDS.map(x => (
            <Button key={`kind-${x.kind}`} label={`${x.label} ${kindCount(x.kind)}`} variant={x.kind === current.kind ? 'primary' : 'secondary'} onPress={() => disarm($).then(() => update($, kindTab, () => x.kind))} />
          )),
          v === 'used' ? [<Button key="sort" label={sort === 'least' ? '↑ Least used' : '↓ Most used'} variant="secondary" onPress={() => update($, sortBy, s => (s === 'least' ? 'most' : 'least'))} />] : undefined,
        )}
      {body as never}
      {legend(ui, 'usage-legend', legendText)}
      {toolbar(
        ui,
        'usage-foot',
        [<Button key="info" label={infoOpen ? 'Hide notes' : 'About these numbers'} variant="secondary" onPress={() => update($, info, o => !o)} />],
        sc === 'all' && (v === 'used' || v === 'tools')
          ? [
              <Button key="reset" label={armed ? 'Really reset all counts?' : 'Reset all'} variant="secondary" onPress={() => resetAll($)} />,
              ...(armed ? [<Button key="cancel" label="Cancel" variant="secondary" onPress={() => update($, confirmReset, () => false)} />] : []),
            ]
          : undefined,
      )}
      {infoOpen && card(ui, 'usage-notes', 'neutral', [sectionTitle(ui, 'usage-notes-head', 'About these numbers'), ...NOTES.map((n, i) => <Text key={`n${i}`} dimColor size={TYPE.label} wrap="wrap">{`• ${n}`}</Text>)])}
    </Box>
  )
}
