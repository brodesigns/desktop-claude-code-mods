import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, ToolCallInput, ToolCallResult } from 'claude-code'

import type { LogEntry, LogLine } from '../types'
import { columns, isNarrow } from './layout'
import { cleanCommand, isProblem, keep, MARK, outcome, short, statusWord, tone } from './logs'

const PANE = 'log-viewer'
const TITLE = 'Logs'

// Change the tag when LogEntry's fields change: a value an earlier version stored is then declined.
const logs = atom({ plugin: 'log-viewer', key: 'logList' } as const, [], { shape: 'logs-1' })
const filter = atom({ plugin: 'log-viewer', key: 'logFilter' } as const, 'all')
const query = atom({ plugin: 'log-viewer', key: 'logQuery' } as const, '')
const opened = atom({ plugin: 'log-viewer', key: 'logOpen' } as const, '')

async function begin($: EngineInterface, e: ToolCallInput & { command: string }): Promise<LogEntry> {
  const entry: LogEntry = {
    id: e.tool_use_id,
    command: cleanCommand(e.command),
    startedAt: await $.clock.now(),
    ms: 0,
    status: 'running',
    exitCode: null,
    note: '',
    lines: [],
    cut: 0,
    agent: e.agentId !== undefined,
  }
  await update($, logs, list => keep(list, entry))

  return entry
}

async function finish($: EngineInterface, entry: LogEntry, ran: ToolCallResult) {
  const ms = Math.max(0, (await $.clock.now()) - entry.startedAt)
  const done: LogEntry = { ...entry, ms, ...outcome(ran) }
  await update($, logs, list => keep(list, done))
}

// The latest open (''), none ('-'), or the one clicked. A click on the open entry closes it.
async function toggle($: EngineInterface, id: string, newest: string) {
  await update($, opened, now => {
    const isOpen = now === id || (now === '' && id === newest)
    return isOpen ? '-' : id === newest ? '' : id
  })
}

// A scroll that cannot happen (no surface, a move came first) is no error for the pane.
async function scrollEnd($: EngineInterface) {
  try {
    await $.ui.scroll({ in: PANE, to: 'end' })
  } catch {
    // Nothing to scroll.
  }
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

const cut = (text: string, room: number) => (text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text)

function output(ui: Ui, x: LogEntry, q: string) {
  const { Box, Text } = ui
  const shown: LogLine[] = q === '' ? x.lines : x.lines.filter(l => l.t.toLowerCase().includes(q))
  const border = x.status === 'error' ? 'error' : x.status === 'running' ? 'subtle' : x.status === 'ok' ? 'subtle' : 'warning'

  return (
    <Box key={`out-${x.id}`} flexDirection="column" marginLeft="sm" marginY="xs" paddingX="sm" borderStyle="round" overflow="hidden" borderColor={border}>
      <Text key="cmd" mono size="caption" wrap="wrap">$ {x.command}</Text>
      {x.note !== '' && x.status === 'denied' && <Text key="note" color="warning" size="caption" wrap="wrap">{x.note}</Text>}
      {x.cut > 0 && <Text key="cut" dimColor size="caption">{x.lines.length === 0 ? `${x.cut} lines, no longer kept` : `${x.cut} earlier lines left out`}</Text>}
      {x.status === 'running' && <Text key="run" dimColor size="caption">running …</Text>}
      {x.status !== 'running' && x.lines.length === 0 && x.cut === 0 && <Text key="none" dimColor size="caption">(no output)</Text>}
      {q !== '' && x.lines.length > 0 && <Text key="hits" dimColor size="caption">{shown.length} of {x.lines.length} lines contain "{q}"</Text>}
      {shown.map((l, i) => {
        const t = tone(l.t)
        return (
          <Text key={`l${i}`} mono size="caption" wrap="wrap" color={t} dimColor={t === undefined && l.err}>
            {l.t === '' ? ' ' : l.t}
          </Text>
        )
      })}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'logs', description: 'Show the output of the last Bash calls in a pane' })

    return next(e)
  })

  on('command.run', { command: 'logs' }, async $ => {
    const res = await $.ui.open({ id: PANE, title: TITLE })

    return { text: res.isPlaced ? 'Logs opened.' : 'Logs: the pane is waiting for room.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    let entry: LogEntry | null = null
    try {
      entry = await begin($, e)
    } catch {
      entry = null
    }
    const ran = await next(e)
    if (entry !== null) {
      try {
        await finish($, entry, ran)
      } catch {
        // The call's result stands; only the pane misses it.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const all = await read($, logs)
    const f = await read($, filter)
    const raw = await read($, query)
    const q = raw.trim().toLowerCase()
    const open = await read($, opened)
    const narrow = isNarrow(e as unknown as RenderInput)
    const width = columns(e as unknown as RenderInput)

    const failed = all.filter(isProblem).length
    const list = all.filter(x => (f !== 'errors' || isProblem(x)) && (q === '' || x.command.toLowerCase().includes(q) || x.lines.some(l => l.t.toLowerCase().includes(q))))
    const newest = list[list.length - 1]?.id ?? ''
    const openId = open === '' ? newest : open
    const COL = { mark: 2, status: narrow ? 0 : 11, time: 7 }
    const room = Math.max(8, width - COL.mark - COL.status - COL.time - 6)

    const row = (x: LogEntry) => {
      const m = MARK[x.status]
      const isOpen = x.id === openId

      return (
        <Box key={`e-${x.id}`} flexDirection="column">
          <Box alignItems="center" gap="xs">
            <Box width={COL.mark} flexShrink={0}>
              <Text color={m.color} weight="bold">{m.glyph}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Button key={`t-${x.id}`} plain onPress={() => toggle($, x.id, newest)}>
                {isOpen ? '▾' : '▸'} {x.agent ? '▌' : ''}{cut(x.command.replace(/\s+/g, ' '), room)}
              </Button>
            </Box>
            {!narrow && (
              <Box width={COL.status} flexShrink={0} justifyContent="flex-end">
                <Text color={x.status === 'ok' ? undefined : m.color} dimColor={x.status === 'ok'} size="caption" wrap="truncate">{statusWord(x)}</Text>
              </Box>
            )}
            <Box width={COL.time} flexShrink={0} justifyContent="flex-end">
              <Text dimColor tabular size="caption">{x.status === 'running' ? '…' : short(x.ms)}</Text>
            </Box>
          </Box>
          {isOpen && output(ui, x, q)}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm" padding={narrow ? 'xs' : 'sm'}>
        <Box justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="xs">
          <Box gap="xs" flexWrap="wrap">
            <Button key="f-all" label={`All ${all.length}`} variant={f === 'all' ? 'primary' : 'secondary'} onPress={() => update($, filter, () => 'all')} />
            <Button key="f-errors" label={`Errors only ${failed}`} variant={f === 'errors' ? 'primary' : 'secondary'} onPress={() => update($, filter, () => 'errors')} />
          </Box>
          <Box gap="xs" flexWrap="wrap">
            <Button key="end" label="↓ to bottom" variant="secondary" onPress={() => void scrollEnd($)} />
            <Button key="clear" label="Clear" variant="secondary" onPress={() => update($, logs, () => [])} />
          </Box>
        </Box>
        {'Input' in ui && (
          <Box gap="xs" alignItems="center">
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <ui.Input
                key="q"
                label="Search"
                placeholder="Text in command or output"
                value={raw}
                submitLabel="filter"
                onInput={(v: string) => void update($, query, () => v)}
                onSubmit={(v: string) => void update($, query, () => v)}
              />
            </Box>
            {raw !== '' && <Button key="q-clear" label="×" variant="secondary" onPress={() => update($, query, () => '')} />}
          </Box>
        )}
        {list.length === 0 && (
          <Box key="empty" borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs">
            <Text dimColor size="footnote" wrap="wrap">{all.length === 0 ? '⌘ No Bash calls in this session yet.' : '⌕ Nothing for this filter.'}</Text>
          </Box>
        )}
        {list.length > 0 && (
          <Box key="list" flexDirection="column" borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs" gap="xs">
            {list.map(row)}
          </Box>
        )}
        {all.length > 0 && (
          <Box key="legend" minWidth={0} overflow="hidden">
            <Text dimColor size="caption" wrap="wrap">✓ done · ✗ error · ⛨ blocked · ■ interrupted · ◐ background · ▌ subagent · Newest at the bottom, a click opens the output</Text>
          </Box>
        )}
      </Box>
    )
  })
}
