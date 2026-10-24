import { atom, read } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import { isFailed } from './status'
import { card, cardHead, emptyState, line, more, sectionCount, sectionTitle, SPACE, statusDot, tile, tiles, TYPE } from './style'

const calls = atom({ plugin: 'bro-cockpit', key: 'callList' } as const, [])

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  // Totals count everything kept; the list shows the newest entries, oldest first, newest at the bottom.
  // Calls denied by a hook are not tool errors and do not show here.
  const failedAll = (await read($, calls)).filter(isFailed)
  const failed = failedAll.slice(-15)
  const byAgent = failedAll.filter(c => c.agent).length
  const tools = new Set(failedAll.map(c => c.tool)).size

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {tiles(ui, 'error-tiles', [
        tile(ui, String(failedAll.length), 'tool calls', failedAll.length > 0 ? 'error' : 'neutral'),
        tile(ui, String(byAgent), 'by subagents', byAgent > 0 ? 'error' : 'neutral'),
        tile(ui, String(tools), 'tools'),
      ])}
      {failedAll.length === 0 && emptyState(ui, 'errors-empty', '✓', 'All calm: no failed calls.', 'success')}

      {failedAll.length > 0 && sectionTitle(ui, 's-calls', 'Failed tool calls', sectionCount(ui, failedAll.length))}
      {more(ui, 'more-calls', failedAll.length - failed.length)}
      {failed.map(c =>
        card(ui, `ec-${c.id}`, 'error', [
          cardHead(ui, 'h', [statusDot(ui, 'd', 'error'), `${c.tool}${c.agent ? ' · Agent' : ''}`], <Text dimColor tabular size={TYPE.label}>{clock(c.startedAt)}</Text>),
          c.arg !== '' ? line(ui, 'a', c.arg, { mono: true, size: 'caption' }) : null,
          c.note !== '' ? line(ui, 'n', c.note, { dim: false, color: 'error', size: 'caption' }) : null,
        ]),
      )}
    </Box>
  )
}
