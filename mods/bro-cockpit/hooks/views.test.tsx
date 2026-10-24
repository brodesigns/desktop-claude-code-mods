import { expect, test } from 'claude-code/testing'

// Every view mounts with empty data on the terminal and the desktop and none shows the error card.
const PANE = {
  plugin: 'bro-cockpit',
  component: 'Pane',
  requestId: 'bro-cockpit',
  props: { title: 'Cockpit', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const TABS = ['home', 'files', 'agents', 'calls', 'meter', 'errors', 'project'] as const

type OnLike = (event: string, hook: (_: unknown, e: unknown) => unknown) => void

// A state with nothing in it but the chosen tab: every other atom reads its empty start value.
const emptyState = (on: OnLike, tab: string) => {
  on('state.get', (_, e) => ({ value: { value: (e as { key: string }).key === 'cockpitTab' ? tab : undefined, version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))
}

for (const tab of TABS) {
  test(`the ${tab} view mounts with empty data`, async ($, on) => {
    emptyState(on as never, tab)
    on('clock.now', () => ({ value: 1 }))

    for (const surface of ['terminal', 'desktop'] as const) {
      for (const bodyColumns of [36, 80]) {
        const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
        expect((await ui.find({ type: 'Text', text: /Cockpit/ })) != null).toBe(true)
        expect((await ui.find({ type: 'Text', text: /has an error/ })) == null).toBe(true)
        await ui.unmount()
      }
    }
  })
}

// The check above can fail: a tab that throws on broken data shows the error card, the head stays.
test('a tab that throws shows the error card, not a blank pane', async ($, on) => {
  on('state.get', (_, e) => {
    const key = (e as { key: string }).key
    return { value: { value: key === 'cockpitTab' ? 'meter' : key === 'meter' ? { percent: 5 } : undefined, version: 1 } }
  })
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /has an error/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Text', text: /Cockpit/ })) != null).toBe(true)
  await ui.unmount()
})

// Filled data runs the card paths too: long texts, a failed call, a running agent, an idea.
const LONG = 'a very long text that fits in no narrow pane and has to be cut off at the border'
const FILLED: Record<string, unknown> = {
  headCounts: { calls: 2, callsFailed: 1, files: 1, filesChanged: 1, filesRead: 1, agentsRunning: 1, agentsTotal: 2, context: 91, limit: 40, errors: 1, ideas: 1, ideasOpen: 1 },
  gitInfo: { project: 'demo-project-with-a-long-name', branch: 'feature/a-very-long-branch-name', changed: 3, staged: 1, modified: 1, untracked: 1, ahead: 2, behind: 1 },
  callList: [
    { id: 'c1', tool: 'Bash', arg: LONG, detail: LONG, lines: 0, note: 'command not found', isDone: true, isError: true, isDenied: false, startedAt: 1, ms: 1200, agent: false, agentId: '' },
    { id: 'c2', tool: 'Read', arg: '/p/file.ts', detail: '/p/file.ts', lines: 0, note: '', isDone: false, isError: false, isDenied: false, startedAt: 2, ms: 0, agent: true, agentId: 'a1' },
  ],
  fileList: [{ path: `/home/x/projects/demo/src/components/${LONG.replace(/ /g, '-')}.tsx`, reads: 2, writes: 0, edits: 3, lines: 40, agent: true, at: 3 }],
  agentList: [
    { id: 'a1', type: 'Explore', description: LONG, isBackground: true, isDone: false, isFailed: false, tools: 4, last: 'Read', startedAt: 1, endedAt: 0, parent: '' },
    { id: 'a2', type: 'Plan', description: LONG, isBackground: false, isDone: true, isFailed: true, tools: 1, last: '', startedAt: 1, endedAt: 9, parent: 'a1' },
  ],
  meter: { percent: 91, tokens: 182_000, window: 200_000, usd: 1.5, limits: [{ kind: 'five_hour', percent: 40, resetsAt: '' }, { kind: 'seven_day', percent: 88, resetsAt: '' }] },
  turnStats: [{ at: 1, ms: 70_000, input: 10, output: 20, cacheRead: 30, cacheWrite: 5, isAgent: false }],
  projectInfo: { project: 'demo', root: '~/demo', kinds: ['Node'], scripts: [{ name: 'test', cmd: LONG }], key: 'project:demo:abc' },
  ideaList: [{ id: 1, kind: 'idea', text: LONG, status: 'running', at: 1 }],
}

for (const tab of TABS) {
  test(`the ${tab} view mounts with filled data`, async ($, on) => {
    on('state.get', (_, e) => {
      const key = (e as { key: string }).key
      return { value: { value: key === 'cockpitTab' ? tab : FILLED[key], version: 1 } }
    })
    on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))
    on('clock.now', () => ({ value: 1 }))

    for (const surface of ['terminal', 'desktop'] as const) {
      for (const bodyColumns of [36, 80]) {
        const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
        expect((await ui.find({ type: 'Text', text: /has an error/ })) == null).toBe(true)
        await ui.unmount()
      }
    }
  })
}

test('the band above the prompt draws with filled data, narrow and wide', async ($, on) => {
  on('state.get', (_, e) => ({ value: { value: FILLED[(e as { key: string }).key], version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))
  // Stands for the bands of other mods beneath: they stay drawn under this one.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false }, surface } as never)
    expect((await ui.find({ type: 'Text', text: /demo-project/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
})

// A tab switched off in /config is gone from the pane and from the start page; the tab stored as open falls back.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`a tab switched off is hidden (${surface})`, { options: { show_files: false } }, async ($, on) => {
    emptyState(on as never, 'files')
    on('clock.now', () => ({ value: 1 }))

    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Areas/ })) != null).toBe(true)
    expect((await ui.find({ text: /Files/ })) == null).toBe(true)
    expect((await ui.find({ text: /Subagents/ })) != null).toBe(true)
    await ui.unmount()
  })

  test(`every tab switched off leaves a hint (${surface})`, {
    options: { show_home: false, show_files: false, show_agents: false, show_calls: false, show_meter: false, show_errors: false, show_project: false },
  }, async ($, on) => {
    emptyState(on as never, 'home')
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /All tabs are off/ })) != null).toBe(true)
    await ui.unmount()
  })
}

test('the band stays away when it is switched off', { options: { show_gitband: false } }, async ($, on) => {
  on('state.get', (_, e) => ({ value: { value: FILLED[(e as { key: string }).key], version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))
  // Stands for the engine's own drawing, which the band hands on to when it is off.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false }, surface } as never)
    expect((await ui.find({ type: 'Text', text: /demo-project/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
})
