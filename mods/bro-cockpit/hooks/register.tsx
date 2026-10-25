import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import { countTool, register as agents, start as startAgents, view as agentsView, worker } from './agents'
import { EMPTY_COUNTS, refreshCounts } from './counts'
import { view as filesView, track } from './files'
import { view as errorsView } from './errors'
import { register as meter, start as startMeter, view as meterView } from './meter'
import { line as gitLine, register as git, start as startGit } from './git'
import { register as projectCommands, start as startProject, view as projectView } from './project'
import { view as homeView } from './home'
import { startTodo, todoTouched, view as todoView } from './todo'
import { begin, finish, view as toolcallsView } from './toolcalls'
import { isNarrow } from './layout'
import { PANE } from './pane'
import { isOn } from './settings'
import { card, cardHead, SPACE, TYPE } from './style'

const TABS = [
  { id: 'home', icon: '⌂', label: 'Overview' },
  { id: 'files', icon: '▤', label: 'Files' },
  { id: 'agents', icon: '◆', label: 'Subagents' },
  { id: 'calls', icon: '⌘', label: 'Tool calls' },
  { id: 'meter', icon: '◔', label: 'Instruments' },
  { id: 'errors', icon: '⚠', label: 'Errors' },
  { id: 'todo', icon: '☐', label: 'Todo' },
  { id: 'project', icon: '▣', label: 'Project' },
] as const
const tab = atom({ plugin: 'bro-cockpit', key: 'cockpitTab' } as const, 'home')
const headCounts = atom({ plugin: 'bro-cockpit', key: 'headCounts' } as const, EMPTY_COUNTS)

// One tab's view; a tab that throws shows a card instead of taking the whole pane down.
async function safe($: EngineInterface, e: RenderInput, current: string, go: (id: string) => void, shown: (id: string) => boolean) {
  try {
    switch (current) {
      case 'home': return await homeView($, e, go, shown)
      case 'files': return await filesView($, e)
      case 'agents': return await agentsView($, e)
      case 'calls': return await toolcallsView($, e)
      case 'meter': return await meterView($, e)
      case 'errors': return await errorsView($, e)
      case 'todo': return await todoView($, e)
      case 'project': return await projectView($, e)
      default: return null
    }
  } catch (err) {
    const ui = $.ui.resolve(e)
    const { Text } = ui
    const message = String(err instanceof Error ? err.message : err).slice(0, 200)

    return card(ui, 'tab-error', 'error', [
      cardHead(ui, 'tab-error-head', <Text color="error">✗ This tab has an error</Text>),
      <Text key="tab-error-text" dimColor mono size={TYPE.label} wrap="wrap">{message}</Text>,
    ])
  }
}

export const register: Register = (on, options) => {
  // Only the tabs switched on in /config; the first of them stands in for a tab that was switched off.
  const tabs = TABS.filter(t => isOn(options, t.id))
  const shown = (id: string) => tabs.some(t => t.id === id)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Open the cockpit pane: /cockpit [home|files|agents|calls|meter|errors|todo|project]' })
    void $.ui.open({ id: PANE, title: 'Cockpit' })
    await startGit($)
    await startAgents($)
    await startMeter($)
    await startProject($)
    await startTodo($, String(options.markers ?? ''), options.sessionFiles !== false)
    await refreshCounts($)

    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const want = String(e.args ?? '').trim()
    if (shown(want)) await update($, tab, () => want)
    await $.ui.open({ id: PANE, title: 'Cockpit' })

    return { text: 'Cockpit pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const call = await begin($, e)
    await countTool($, e)
    // The call count moves now, not when a long call ends.
    await refreshCounts($)
    const ran = await next(e)
    await finish($, call, ran)
    await track($, e, ran)
    await todoTouched($, e, ran)
    await refreshCounts($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // The head reads three atoms: the tab, the bundled counts and the git line. The lists stay with the tabs.
    const picked = await read($, tab)
    const current = shown(picked) ? picked : (tabs[0]?.id ?? '')
    const c = await read($, headCounts)
    const narrow = isNarrow(e)
    const counts: Record<string, string> = {
      agents: c.agentsRunning > 0 ? ` ⚙${c.agentsRunning}` : '',
      calls: c.calls > 0 ? ` ${c.calls}` : '',
      files: c.files > 0 ? ` ${c.files}` : '',
      meter: c.context >= 0 ? ` ${c.context}%` : '',
      errors: c.errors > 0 ? ` ⚠${c.errors}` : '',
      todo: c.todoOpen > 0 ? ` ${c.todoOpen}` : '',
      project: c.ideasOpen > 0 ? ` ${c.ideasOpen}` : '',
    }
    // The same label in the select and in the terminal's button row.
    const label = (t: (typeof TABS)[number]) => `${t.icon} ${t.label}${counts[t.id] ?? ''}`

    return (
      <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
        <Box flexDirection={narrow ? 'column' : 'row'} justifyContent="space-between" alignItems={narrow ? 'stretch' : 'center'} gap={SPACE.tight}>
          <Box gap={SPACE.base} alignItems="center" flexShrink={0}>
            <Text size={TYPE.heading} weight="semibold">Cockpit</Text>
            {c.agentsRunning > 0 && (await worker($, e, narrow ? 32 : 44))}
          </Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent={narrow ? 'flex-start' : 'flex-end'}>
            {await gitLine($, e)}
          </Box>
        </Box>
        {tabs.length === 0 ? (
          <Text key="tabs-off" dimColor wrap="wrap">All tabs are off. Switch them on in /config, section bro-cockpit.</Text>
        ) : 'Select' in ui ? (
          <ui.Select
            key="tab-select"
            label="View"
            value={current}
            options={tabs.map(t => ({ value: t.id, label: label(t) }))}
            onSelect={(v: string) => update($, tab, () => v)}
          />
        ) : (
          <Box gap={SPACE.tight} flexWrap="wrap">
            {tabs.map(t => (
              <Button
                key={`tab-${t.id}`}
                label={label(t)}
                variant={t.id === current ? 'primary' : 'secondary'}
                onPress={() => update($, tab, () => t.id)}
              />
            ))}
          </Box>
        )}
        {await safe($, e, current, id => void (shown(id) && update($, tab, () => id)), shown)}
      </Box>
    )
  })

  git(on, options)
  meter(on, options)
  agents(on, options)
  projectCommands(on, options)
}
