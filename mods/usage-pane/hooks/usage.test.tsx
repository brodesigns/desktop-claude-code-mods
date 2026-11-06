import { expect, test } from 'claude-code/testing'

import { ago, asItems, bump, MAX_ENTRIES, mcpHits, rank, skillHits } from './usage'

const PANE = {
  plugin: 'usage-pane',
  component: 'Pane',
  requestId: 'usage-pane',
  props: { title: 'Usage', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('MCP tool names give the connector, and the plugin for a plugin server', () => {
  expect(mcpHits('mcp__github__get_file')).toEqual([{ kind: 'connector', name: 'github' }])
  expect(mcpHits('mcp__claude_ai_Gmail__search')).toEqual([{ kind: 'connector', name: 'claude.ai Gmail' }])
  expect(mcpHits('mcp__plugin_acme_browser__open')).toEqual([
    { kind: 'connector', name: 'browser' },
    { kind: 'plugin', name: 'acme' },
  ])
  expect(mcpHits('Bash')).toEqual([])
})

test('a skill counts for itself and for its plugin', () => {
  expect(skillHits('commit')).toEqual([{ kind: 'skill', name: 'commit' }])
  expect(skillHits('review', 'acme')).toEqual([
    { kind: 'skill', name: 'review' },
    { kind: 'plugin', name: 'acme' },
  ])
  expect(skillHits('bad\nname\u0000')[0]?.name).toBe('bad name')
})

test('bump counts, keeps first and last, and caps the list', () => {
  let items = bump({}, skillHits('a'), 100)
  items = bump(items, skillHits('a'), 200)
  expect(items['skill:a']).toEqual({ kind: 'skill', name: 'a', n: 2, first: 100, last: 200 })
  for (let i = 0; i < MAX_ENTRIES + 20; i++) items = bump(items, skillHits(`s${i}`), 300 + i)
  expect(Object.keys(items).length).toBe(MAX_ENTRIES)
  expect(items['skill:a']).toBeUndefined()
})

test('rank: most used first, or least used first with the longest idle on top', () => {
  let items = bump({}, [{ kind: 'skill', name: 'rare' }], 10)
  for (let i = 0; i < 3; i++) items = bump(items, [{ kind: 'skill', name: 'often' }], 20 + i)
  items = bump(items, [{ kind: 'skill', name: 'old' }], 1)
  items = bump(items, [{ kind: 'plugin', name: 'p' }], 5)
  expect(rank(items, 'skill', 'most').map(x => x.name)).toEqual(['often', 'rare', 'old'])
  expect(rank(items, 'skill', 'least').map(x => x.name)).toEqual(['old', 'rare', 'often'])
})

test('asItems drops what the store should not hold', () => {
  const ok = { kind: 'skill', name: 'a', n: 2, first: 1, last: 2 }
  const out = asItems({ x: ok, y: { kind: 'tool', name: 'z', n: 1 }, z: 5, w: { kind: 'plugin', name: '', n: 1 }, v: { ...ok, name: 'b', n: -4 } })
  expect(Object.keys(out).sort()).toEqual(['skill:a', 'skill:b'])
  expect(out['skill:b']?.n).toBe(0)
  expect(asItems('x')).toEqual({})
})

test('ago is short', () => {
  expect(ago(1000, 1000)).toBe('now')
  expect(ago(5 * 60000, 0)).toBe('5m')
  expect(ago(3 * 3600000, 0)).toBe('3h')
  expect(ago(12 * 86400000, 0)).toBe('12d')
})

test('skills and MCP calls are counted, saved in the store, and shown in the pane', async ($, on) => {
  const store: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('clock.now', () => ({ value: 5_000_000 }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' }))

  await $.skill.prompt({ skill: 'commit', text: 'x', source: 'built-in' })
  await $.skill.prompt({ skill: 'commit', text: 'x', source: 'built-in' })
  await $.skill.prompt({ skill: 'review', text: 'x', source: 'plugin', pluginName: 'acme' })
  await $.tool.call({ tool: 'mcp__github__get_file' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const saved = store.usage as Record<string, { n: number }>
  expect(saved['skill:commit']?.n).toBe(2)
  expect(saved['plugin:acme']?.n).toBe(1)
  expect(saved['connector:github']?.n).toBe(1)
  expect(Object.keys(saved).some(k => k.includes('Bash'))).toBe(false)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: 'Skills 2' })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: '2×' })) != null).toBe(true)
    await ui.press({ key: 'tab-connector' })
    expect((await ui.find({ type: 'Text', text: 'github' })) != null).toBe(true)
    await ui.press({ key: 'tab-skill' })
    await ui.unmount()
  }
})

test('a refused MCP call and an empty pane count nothing', async ($, on) => {
  const store: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('clock.now', () => ({ value: 1 }))
  on('tool.call', () => ({ deny: 'blocked' }))
  await $.tool.call({ tool: 'mcp__github__get_file' })
  expect(store.usage).toBeUndefined()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /No skill used yet/ })) != null).toBe(true)
    await ui.unmount()
  }
})
