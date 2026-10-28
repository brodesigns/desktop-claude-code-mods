import { atom, read } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import { EMPTY_COUNTS } from './counts'
import { isNarrow, isWide } from './layout'
import { card, cardHead, emptyState, sectionTitle, SPACE, TYPE } from './style'

const headCounts = atom({ plugin: 'bro-cockpit', key: 'headCounts' } as const, EMPTY_COUNTS)

type Go = (tab: string) => void
type Entry = { id: string; icon: string; title: string; value: string; sub: string; tone: string; alert: boolean }

// The start page: one tile per tab with its most important number; red tiles first in the attention list.
export async function view($: EngineInterface, e: RenderInput, go: Go, shown: (tab: string) => boolean = () => true) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const wide = isWide(e)

  // One atom for every number on this page: a tool call redraws it only when a shown number moves.
  const c = await read($, headCounts)
  const files = { changed: c.filesChanged, read: c.filesRead }
  const agents = { running: c.agentsRunning, total: c.agentsTotal }
  const calls = { total: c.calls, failed: c.callsFailed }
  const meter = { percent: c.context, limit: c.limit }
  const project = { open: c.ideasOpen, total: c.ideas }
  const errors = c.errors
  const todo = { open: c.todoOpen, code: c.todoCode }

  const hot = meter.percent >= 85 || meter.limit >= 85
  // Failed calls show once in the attention list, under Errors; the calls tile names them in its sub line.
  const entries: Entry[] = [
    { id: 'files', icon: '▤', title: 'Files', value: `${files.changed}`, sub: `changed · ${files.read} read`, tone: files.changed > 0 ? 'suggestion' : 'text', alert: false },
    { id: 'agents', icon: '◆', title: 'Subagents', value: `${agents.running}`, sub: `running · ${agents.total} total`, tone: agents.running > 0 ? 'warning' : 'text', alert: false },
    { id: 'calls', icon: '⌘', title: 'Tool calls', value: `${calls.total}`, sub: calls.failed > 0 ? `${calls.failed} ${calls.failed === 1 ? 'error' : 'errors'}` : 'no errors', tone: calls.failed > 0 ? 'error' : 'text', alert: false },
    { id: 'meter', icon: '◔', title: 'Instruments', value: meter.percent >= 0 ? `${meter.percent}%` : '·', sub: meter.limit >= 0 ? `context · 5h limit ${meter.limit}%` : 'context', tone: hot ? 'error' : meter.percent >= 60 ? 'warning' : 'success', alert: hot },
    { id: 'errors', icon: '⚠', title: 'Errors', value: `${errors}`, sub: errors > 0 ? 'need attention' : 'all calm', tone: errors > 0 ? 'error' : 'success', alert: errors > 0 },
    { id: 'todo', icon: '☐', title: 'Todo', value: `${todo.open}`, sub: `open · ${todo.code} in code`, tone: todo.open > 0 ? 'warning' : 'text', alert: false },
    { id: 'project', icon: '▣', title: 'Project', value: `${project.open}`, sub: `open ideas · ${project.total} total`, tone: project.open > 0 ? 'warning' : 'text', alert: false },
  ].filter(x => shown(x.id))
  const attention = entries.filter(x => x.alert)
  // One column on a narrow pane, two in the middle, three on a wide one.
  const width = narrow ? '100%' : wide ? '32%' : '48%'
  // Calm values stay in the text colour; only warnings and real problems get theirs.
  const valueColor = (x: Entry) => (x.alert ? 'error' : x.tone === 'warning' ? 'warning' : 'text')

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {attention.length > 0
        ? card(ui, 'home-attention', 'error', [
            cardHead(ui, 'home-attention-head', <Text color="error">⚠ Needs attention</Text>, <Text color="error" size={TYPE.label} weight="semibold">{attention.length}</Text>),
            ...attention.map(x => (
              <Box key={`a-${x.id}`} justifyContent="space-between" alignItems="center" gap={SPACE.base}>
                <Box flexShrink={1} minWidth={0} overflow="hidden">
                  <Text size={TYPE.body} wrap="truncate">{x.icon} {x.title}: <Text color="error" weight="semibold">{x.value}</Text> <Text dimColor>{x.sub}</Text></Text>
                </Box>
                <Box flexShrink={0}>
                  <Button key={`ag-${x.id}`} label="open ›" variant="secondary" onPress={() => go(x.id)} />
                </Box>
              </Box>
            )),
          ], 'sm')
        : emptyState(ui, 'home-calm', '✓', 'All calm, nothing needs attention.', 'success')}

      {sectionTitle(ui, 'home-areas', 'Areas')}
      <Box gap={SPACE.base} flexWrap="wrap">
        {entries.map(x => (
          <Box
            key={`h-${x.id}`}
            flexDirection="column"
            flexGrow={0}
            width={width}
            minWidth={narrow ? 0 : 18}
            borderStyle="round"
            overflow="hidden"
            borderColor={x.alert ? 'error' : 'subtle'}
            paddingX="sm"
            paddingY="xs"
          >
            <Box justifyContent="space-between" alignItems="center" gap={SPACE.tight}>
              <Box flexShrink={1} minWidth={0} overflow="hidden">
                <Text dimColor={!x.alert} color={x.alert ? 'error' : undefined} size={TYPE.label} weight="semibold" wrap="truncate">{x.alert ? '⚠' : x.icon} {x.title}</Text>
              </Box>
              <Box flexShrink={0}>
                <Button key={`hb-${x.id}`} plain dimColor label="open ›" onPress={() => go(x.id)} />
              </Box>
            </Box>
            <Text size={TYPE.figure} weight="bold" tabular color={valueColor(x)} wrap="truncate">{x.value}</Text>
            <Text dimColor size={TYPE.label} wrap="truncate">{x.sub}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
