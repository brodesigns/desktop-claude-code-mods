import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { dayKey, duration, entryKey, money, plural } from './day'

const SURFACES = ['terminal', 'desktop'] as const
// Local time, so the test reads the same in every time zone. Fri 2026-10-23 10:00.
const NOW = new Date(2026, 9, 23, 10, 0).getTime()
const MIN = 60_000
const HOUR = 60 * MIN
const TODAY = '2026-10-23'
// The money format follows the user's locale, so expected amounts are built the same way.
const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const band = (surface: (typeof SURFACES)[number], hasSurvey = false) =>
  ({
    plugin: 'daily-band',
    component: 'AbovePrompt',
    surface,
    props: { hasSurvey, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as never

type World = { store: Map<string, unknown>; cost: { usd: number }; gitCalls: string[][] }

// The engine around the plugin: an in-memory store, a session `me` with a cost ledger, git with 5 commits today.
const world = (on: On, init: Record<string, unknown> = {}): World => {
  const w: World = { store: new Map(Object.entries(init)), cost: { usd: 0.5 }, gitCalls: [] }
  on('store.get', (_, e) => ({ value: w.store.get(e.key) }))
  on('store.set', (_, e) => {
    w.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    w.store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...w.store.keys()] }))
  on('session.id', () => ({ value: 'me' }))
  on('session.cwd', () => ({ value: '/home/x/demo' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: w.cost.usd } } }))
  on('process.run', (_, e) => {
    const argv = [...(e as unknown as { argv: string[] }).argv]
    w.gitCalls.push(argv)
    const out = argv.includes('config') ? 'me@example.com\n' : '5\n'
    return { value: { exitCode: 0, stdout: out, stderr: '' } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  return w
}

const turn = (turnId: string, durationMs: number, agentId?: string) =>
  ({ answer: '', durationMs, isAborted: false, turnId, reason: 'answer', ...(agentId !== undefined ? { agentId } : {}) }) as never

const line = async (ui: { find: (q: { type: string; text: RegExp }) => Promise<{ text: string } | undefined | null> }) =>
  (await ui.find({ type: 'Button', text: /Today/ }))?.text ?? null

test('formatting and day keys', () => {
  expect(dayKey(NOW)).toBe(TODAY)
  expect(dayKey(new Date(2026, 9, 23, 23, 59).getTime())).toBe(TODAY)
  expect(dayKey(new Date(2026, 9, 24, 0, 0).getTime())).toBe('2026-10-24')
  expect(duration(45_000)).toBe('45 s')
  expect(duration(12 * MIN)).toBe('12 min')
  expect(duration(2 * HOUR)).toBe('2 h')
  expect(duration(2 * HOUR + 10 * MIN + 30_000)).toBe('2 h 10 min')
  expect(money(4.2)).toBe(usd(4.2))
  expect(money(1234.5)).toBe(usd(1234.5))
  expect(money(4.2)).toMatch(/4.20/)
  expect(plural(1, 'Turn', 'Turns')).toBe('1 Turn')
  expect(plural(38, 'Turn', 'Turns')).toBe('38 Turns')
})

test('a turn adds to the day, merged with the other sessions of today', async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on, { [entryKey(TODAY, 'other')]: { ms: HOUR, turns: 30, usd: 2.95 } })
  await $.session.start({ cwd: '/home/x/demo', surface: 'desktop', isInteractive: true })

  // The cost before the first turn ($0.50) is this session's start, not counted.
  w.cost.usd = 1.75
  await $.turn.complete(turn('t1', 10 * MIN))
  expect(w.store.get(entryKey(TODAY, 'me'))).toEqual({ ms: 10 * MIN, turns: 1, usd: 1.25 })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await line(ui as never)).toBe(`☀ Today 1 h 10 min · ≈ ${usd(4.2)} · 31 Turns · 5 Commits`)
    // The bands beneath (here the engine's stand-in) still draw under it.
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
  expect(w.gitCalls.some(a => a.includes('--since=midnight') && a.includes('--author=me@example.com'))).toBe(true)
})

test('no double counting: a repeated turn id, a subagent turn, an unchanged cost', async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on)
  await $.session.start({ cwd: '/home/x/demo', surface: 'desktop', isInteractive: true })

  w.cost.usd = 1
  await $.turn.complete(turn('t1', 5 * MIN))
  await $.turn.complete(turn('t1', 5 * MIN))
  await $.turn.complete(turn('a1', 9 * MIN, 'agent-1'))
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 }, changed: ['cost'] } as never)
  expect(w.store.get(entryKey(TODAY, 'me'))).toEqual({ ms: 5 * MIN, turns: 1, usd: 0.5 })

  // Cost a subagent added between turns comes with the measure.
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd: 1.25 }, changed: ['cost'] } as never)
  expect(w.store.get(entryKey(TODAY, 'me'))).toEqual({ ms: 5 * MIN, turns: 1, usd: 0.75 })

  // A ledger that starts over (lower than last seen) counts from zero.
  w.cost.usd = 0.25
  await $.turn.complete(turn('t2', MIN))
  expect(w.store.get(entryKey(TODAY, 'me'))).toEqual({ ms: 6 * MIN, turns: 2, usd: 1 })
})

test('a new day starts empty and old days are pruned', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on, { [entryKey('2026-10-10', 'old')]: { ms: HOUR, turns: 3, usd: 1 }, [entryKey('2026-10-22', 'y')]: { ms: HOUR, turns: 3, usd: 1 } })
  await $.session.start({ cwd: '/home/x/demo', surface: 'desktop', isInteractive: true })
  expect(w.store.has(entryKey('2026-10-10', 'old'))).toBe(false)
  expect(w.store.has(entryKey('2026-10-22', 'y'))).toBe(true)

  // Yesterday's entry alone: nothing for today yet.
  const empty = await $.ui.mount(band('desktop'))
  expect(await line(empty as never)).toBe(null)
  await empty.unmount()

  await $.turn.complete(turn('t1', 2 * MIN))
  const before = await $.ui.mount(band('terminal'))
  expect(await line(before as never)).toBe('☀ Today 2 min · 1 Turn · 5 Commits')
  await before.unmount()

  await clock.advance(14 * HOUR + MIN)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await line(ui as never)).toBe(null)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
  await $.turn.complete(turn('t2', 3 * MIN))
  expect(w.store.get(entryKey('2026-10-24', 'me'))).toEqual({ ms: 3 * MIN, turns: 1, usd: 0 })
  const ui = await $.ui.mount(band('desktop'))
  expect(await line(ui as never)).toBe('☀ Today 3 min · 1 Turn · 5 Commits')
  await ui.unmount()
})

test('hidden by the option and under a survey; commits off runs no git', { options: { show: false, commits: false } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on, { [entryKey(TODAY, 'other')]: { ms: HOUR, turns: 30, usd: 2.95 } })
  await $.session.start({ cwd: '/home/x/demo', surface: 'desktop', isInteractive: true })
  await $.turn.complete(turn('t1', MIN))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await line(ui as never)).toBe(null)
    await ui.unmount()
  }
  expect(w.gitCalls.length).toBe(0)
  // Counted all the same.
  expect(w.store.get(entryKey(TODAY, 'me'))).toEqual({ ms: MIN, turns: 1, usd: 0 })
})

test('a survey holds the band', async ($, on) => {
  mock.clock(on, { now: NOW })
  world(on, { [entryKey(TODAY, 'other')]: { ms: HOUR, turns: 30, usd: 2.95 } })
  await $.session.start({ cwd: '/home/x/demo', surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const shown = await $.ui.mount(band(surface))
    expect(await line(shown as never)).toBe(`☀ Today 1 h · ≈ ${usd(2.95)} · 30 Turns · 5 Commits`)
    await shown.unmount()
    const ui = await $.ui.mount(band(surface, true))
    expect(await line(ui as never)).toBe(null)
    await ui.unmount()
  }
})
