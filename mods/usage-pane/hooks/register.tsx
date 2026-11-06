import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { UsageEntry, UsageItems, UsageKind } from '../types'
import { columns, isNarrow } from './layout'
import { ACCENT, actions, emptyState, SPACE, TYPE } from './style'
import { ago, asItems, bump, mcpHits, rank, skillHits } from './usage'
import type { Hit } from './usage'

const PANE = 'usage-pane'
const STORE_KEY = 'usage'

const TABS: { kind: UsageKind; label: string; empty: string }[] = [
  { kind: 'skill', label: 'Skills', empty: 'No skill used yet.' },
  { kind: 'plugin', label: 'Plugins', empty: 'No plugin used yet. A plugin counts when one of its skills or MCP servers runs.' },
  { kind: 'connector', label: 'Connectors', empty: 'No connector (MCP server) used yet.' },
]

// Change the tag when UsageEntry's fields change: a value an earlier version stored is then declined.
const sessionItems = atom({ plugin: 'usage-pane', key: 'sessionItems' } as const, {}, { shape: 'usage-1' })
const allItems = atom({ plugin: 'usage-pane', key: 'allItems' } as const, {}, { shape: 'usage-1' })
const tab = atom({ plugin: 'usage-pane', key: 'usageTab' } as const, 'skill')
const scope = atom({ plugin: 'usage-pane', key: 'usageScope' } as const, 'session')
const sortBy = atom({ plugin: 'usage-pane', key: 'usageSort' } as const, 'most')
const confirmReset = atom({ plugin: 'usage-pane', key: 'usageConfirm' } as const, false)

// Counts the hits in the session and, store first, over all sessions (another session's counts stay).
async function record($: EngineInterface, hits: Hit[]) {
  if (hits.length === 0) return
  const now = await $.clock.now()
  await update($, sessionItems, cur => bump(cur, hits, now))
  const total = bump(asItems(await $.store.get(STORE_KEY)), hits, now)
  await $.store.set(STORE_KEY, total)
  await update($, allItems, () => total)
}

async function load($: EngineInterface) {
  const stored = asItems(await $.store.get(STORE_KEY))
  await update($, allItems, () => stored)
}

async function resetAll($: EngineInterface) {
  const armed = await read($, confirmReset)
  if (!armed) return update($, confirmReset, () => true)
  await $.store.set(STORE_KEY, {})
  await update($, allItems, () => ({}))
  await update($, confirmReset, () => false)
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

const cut = (text: string, room: number) => (text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'toolusage', description: 'Show which skills, plugins and connectors were used, in a pane' })
    try {
      await load($)
    } catch {
      // Only the all-sessions numbers are missing; the session counts still work.
    }

    return next(e)
  })

  on('command.run', { command: 'toolusage' }, async $ => {
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

  // Connectors: every call of an `mcp__server__tool` tool, once it was not refused.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (typeof e.tool === 'string' && e.tool.startsWith('mcp__') && !('deny' in ran)) {
      try {
        await record($, mcpHits(e.tool))
      } catch {
        // The call's result stands; only the pane misses it.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui: Ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const t = await read($, tab)
    const sc = await read($, scope)
    const sort = await read($, sortBy)
    const armed = await read($, confirmReset)
    const items: UsageItems = sc === 'all' ? await read($, allItems) : await read($, sessionItems)
    const now = await $.clock.now()
    const narrow = isNarrow(e as unknown as RenderInput)
    const width = columns(e as unknown as RenderInput)
    const current = TABS.find(x => x.kind === t) ?? TABS[0]!
    const list = rank(items, current.kind, sort)
    const COL = { n: 5, ago: 5 }
    const room = Math.max(8, width - COL.n - (sc === 'all' ? COL.ago : 0) - 8)

    const row = (x: UsageEntry) => (
      <Box key={`r-${x.kind}-${x.name}`} alignItems="center" gap={SPACE.tight}>
        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Text size={TYPE.body} wrap="truncate">{cut(x.name, room)}</Text>
        </Box>
        <Box width={COL.n} flexShrink={0} justifyContent="flex-end">
          <Text tabular weight="semibold" size={TYPE.label}>{`${x.n}×`}</Text>
        </Box>
        {sc === 'all' && (
          <Box width={COL.ago} flexShrink={0} justifyContent="flex-end">
            <Text dimColor tabular size={TYPE.label}>{ago(now, x.last)}</Text>
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
        <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
          <Box flexShrink={0}>
            <Text size={TYPE.title} weight="semibold">Usage</Text>
          </Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end" gap={SPACE.base}>
            <Button key="scope" plain onPress={() => update($, scope, now2 => (now2 === 'all' ? 'session' : 'all'))}>
              <Text size={TYPE.label} color={ACCENT} weight="semibold">{sc === 'all' ? 'all sessions' : 'this session'}</Text>
            </Button>
          </Box>
        </Box>
        <Box key="tabs" gap={SPACE.base} flexWrap="wrap">
          {TABS.map(x => {
            const count = Object.values(items).filter(i => i.kind === x.kind).length
            return (
              <Button key={`tab-${x.kind}`} plain onPress={() => update($, tab, () => x.kind)}>
                <Text size={TYPE.body} weight={x.kind === current.kind ? 'bold' : 'regular'} color={x.kind === current.kind ? ACCENT : undefined}>{`${x.label} ${count}`}</Text>
              </Button>
            )
          })}
        </Box>
        <Box justifyContent="flex-end">
          <Button key="sort" plain onPress={() => update($, sortBy, now2 => (now2 === 'least' ? 'most' : 'least'))}>
            <Text size={TYPE.label} color={ACCENT}>{sort === 'least' ? '↑ least used first' : '↓ most used first'}</Text>
          </Button>
        </Box>
        {list.length === 0 && emptyState(ui, 'empty', '∅', sc === 'all' && Object.keys(items).length === 0 ? 'Nothing recorded yet. Counting starts when this mod is installed.' : current.empty)}
        {list.length > 0 && (
          <Box key="list" flexDirection="column" gap={SPACE.tight}>
            {list.map(row)}
          </Box>
        )}
        {sc === 'all' &&
          actions(ui, 'tools', [
            <Button key="reset" label={armed ? 'Really reset all counts?' : 'Reset all'} variant="secondary" onPress={() => resetAll($)} />,
            ...(armed ? [<Button key="cancel" label="Cancel" variant="secondary" onPress={() => update($, confirmReset, () => false)} />] : []),
          ])}
      </Box>
    )
  })
}
