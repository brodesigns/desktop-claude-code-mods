import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { dateLabel, distance, keyOf, parseArgs } from './when'

const SURFACES = ['terminal', 'desktop'] as const
// Local time, so the test reads the same in every time zone. Fri 2026-06-12 10:00, with no DST change in the
// days the tests span.
const NOW = new Date(2026, 5, 12, 10, 0).getTime()
const local = (y: number, m: number, d: number, hh = 23, mm = 59) => new Date(y, m - 1, d, hh, mm).getTime()
const MIN = 60_000
const HOUR = 60 * MIN
const ROOT = '/home/x/demo'
const KEY = keyOf(ROOT)

const band = (surface: (typeof SURFACES)[number], bodyColumns = 100, hasSurvey = false) =>
  ({
    plugin: 'deadline-band',
    component: 'AbovePrompt',
    surface,
    props: { hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as never

// The engine around the plugin: a git repo at ROOT, the command registry, and a band of its own.
const world = (on: On) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'deadline' } }) as never)
  on('session.cwd', () => ({ value: `${ROOT}/src` }))
  on('session.root', () => ({ value: ROOT }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${ROOT}/.git\n`, stderr: '' } }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
}

// The plugin store in memory, readable by the test (the test's `$` has no store noun).
const memStore = (on: On, init: Record<string, unknown> = {}) => {
  const map = new Map<string, unknown>(Object.entries(init))
  on('store.get', (_, e) => ({ value: map.get(e.key) }))
  on('store.set', (_, e) => {
    map.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    map.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...map.keys()] }))

  return map
}

// The timer ticks each minute: move a day at a time, under the kit's limit of waits per advance.
const days = async (clock: { advance: (ms: number) => Promise<void> }, n: number) => {
  for (let i = 0; i < n; i++) await clock.advance(24 * HOUR)
}

const command = (args: string) => ({ command: 'deadline', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })


type Found = { findAll: (q: { type: string; text: RegExp }) => Promise<{ props: Record<string, unknown> }[]> }
const colorOf = async (ui: Found, text: RegExp) => (await ui.findAll({ type: 'Text', text })).map(f => f.props.color).find(c => c !== undefined)

test('dates parse in every accepted form', () => {
  const set = (args: string) => {
    const p = parseArgs(args, NOW)
    return p.kind === 'set' ? p : null
  }
  expect(set('2026-06-21')).toEqual({ kind: 'set', at: local(2026, 6, 21), text: 'Deadline', hasTime: false })
  expect(set('21.6.2026 14:00 Release 2.0')).toEqual({ kind: 'set', at: local(2026, 6, 21, 14, 0), text: 'Release 2.0', hasTime: true })
  expect(set('21.6. Handover')?.at).toBe(local(2026, 6, 21))
  expect(set('21.6.26')?.at).toBe(local(2026, 6, 21))
  // A day without a year that has passed this year is next year's.
  expect(set('1.6. Taxes')?.at).toBe(local(2027, 6, 1))
  expect(set('2026-06-21T09:30 Go')).toEqual({ kind: 'set', at: local(2026, 6, 21, 9, 30), text: 'Go', hasTime: true })
  expect(set('21.6. at 2pm Handover')).toEqual({ kind: 'set', at: local(2026, 6, 21, 14, 0), text: 'Handover', hasTime: true })
  expect(set('21.6. 12:30 am Go')).toEqual({ kind: 'set', at: local(2026, 6, 21, 0, 30), text: 'Go', hasTime: true })
  expect(set('tomorrow 9:05')?.at).toBe(local(2026, 6, 13, 9, 5))
  // A bare number is text, not a time.
  expect(set('21.6. 14 days buffer')?.text).toBe('14 days buffer')

  expect(parseArgs('', NOW)).toEqual({ kind: 'show' })
  expect(parseArgs('off', NOW)).toEqual({ kind: 'clear' })
  expect(parseArgs('soon', NOW).kind).toBe('error')
  expect(parseArgs('31.2.2026', NOW).kind).toBe('error')
  expect(parseArgs('2026-13-01', NOW).kind).toBe('error')
  expect(parseArgs('21.6. 25:00', NOW).kind).toBe('error')
})

test('countdown and labels', () => {
  expect(dateLabel(local(2026, 6, 21), false, NOW)).toBe('Sun Jun 21')
  expect(dateLabel(local(2026, 6, 21, 14, 0), true, NOW)).toBe('Sun Jun 21 14:00')
  expect(dateLabel(local(2027, 1, 8), false, NOW)).toBe('Fri Jan 8 2027')
  expect(distance(NOW + 3 * 24 * HOUR + 4 * HOUR + 30 * MIN, NOW)).toBe('in 3 days 4 h')
  expect(distance(NOW + 24 * HOUR, NOW)).toBe('in 1 day')
  expect(distance(NOW + 5 * HOUR + 12 * MIN, NOW)).toBe('in 5 h 12 min')
  expect(distance(NOW + 20_000, NOW)).toBe('in less than 1 min')
  expect(distance(NOW - 2 * HOUR - 5 * MIN, NOW)).toBe('overdue by 2 h 5 min')
  expect(distance(NOW - 2 * 24 * HOUR, NOW)).toBe('overdue by 2 days')
})

test('/deadline stores per project and the band counts down', async ($, on) => {
  mock.clock(on, { now: NOW })
  const store = memStore(on)
  world(on)
  await $.session.start({ cwd: `${ROOT}/src`, surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }

  const res = await $.command.run(command('21.6. Release'))
  expect(res.text).toBe('Saved for demo: Release on Sun Jun 21 2026 (end of day), in 9 days 13 h.')
  expect(store.get(KEY)).toEqual({ at: local(2026, 6, 21), text: 'Release', hasTime: false })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect((await ui.find({ type: 'Button', text: /Release/ }))?.text).toBe('⏳ Release in 9 days 13 h · Sun Jun 21')
    // The bands beneath (here the engine's stand-in) still draw under it.
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
  expect((await $.command.run(command(''))).text).toContain('Release (demo): Sun Jun 21 2026, in 9 days 13 h.')
})

test('urgency colours: three days warn, one day and overdue are errors', { timeoutMs: 20_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  world(on)
  await $.session.start({ cwd: `${ROOT}/src`, surface: 'desktop', isInteractive: true })
  await $.command.run(command('14.6. 18:00 Handover'))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await colorOf(ui as never, /^⏳ Handover in 2 days 8 h/)).toBe('warning')
    await ui.unmount()
  }

  await days(clock, 2)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await colorOf(ui as never, /^⚠ Handover in 8 h/)).toBe('error')
    await ui.unmount()
  }

  await clock.advance(9 * HOUR)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface, 40))
    expect((await ui.find({ type: 'Text', text: /Handover/ }))?.text).toBe('⚠ Handover overdue by 1 h')
    await ui.unmount()
  }
})

test('an unparsable date stores nothing and says why; off clears', async ($, on) => {
  mock.clock(on, { now: NOW })
  const store = memStore(on, { [KEY]: { at: local(2026, 6, 30), text: 'Launch', hasTime: false } })
  world(on)
  await $.session.start({ cwd: `${ROOT}/src`, surface: 'desktop', isInteractive: true })

  // Stored by an earlier session: the band shows it at once.
  const shown = await $.ui.mount(band('terminal'))
  expect((await shown.find({ type: 'Text', text: /Launch/ })) != null).toBe(true)
  await shown.unmount()

  const bad = await $.command.run(command('soon Launch'))
  expect(bad.text).toContain('Not saved: "soon" is not a date.')
  expect(store.get(KEY)).toEqual({ at: local(2026, 6, 30), text: 'Launch', hasTime: false })

  expect((await $.command.run(command('off'))).text).toBe('Deadline for demo deleted.')
  expect(store.has(KEY)).toBe(false)
  expect((await $.command.run(command('off'))).text).toContain('No deadline set')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect((await ui.find({ type: 'Text', text: /Launch/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('a store that refuses the write is not reported as saved', async ($, on) => {
  mock.clock(on, { now: NOW })
  world(on)
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => {
    throw new Error('full')
  })
  await $.session.start({ cwd: `${ROOT}/src`, surface: 'desktop', isInteractive: true })

  const res = await $.command.run(command('21.6. Release'))
  expect(res.text).toContain('Not saved')
  const ui = await $.ui.mount(band('desktop'))
  expect((await ui.find({ type: 'Button', text: /Release/ })) == null).toBe(true)
  await ui.unmount()
})

test('under a survey and further away than fromDays the band stays hidden', { options: { fromDays: 3 }, timeoutMs: 20_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, { [KEY]: { at: local(2026, 6, 21), text: 'Release', hasTime: false } })
  world(on)
  await $.session.start({ cwd: `${ROOT}/src`, surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect((await ui.find({ type: 'Button', text: /Release/ })) == null).toBe(true)
    await ui.unmount()
  }

  await days(clock, 7)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect((await ui.find({ type: 'Text', text: /Release in 2 days 13 h/ })) != null).toBe(true)
    await ui.unmount()
    const survey = await $.ui.mount(band(surface, 100, true))
    expect((await survey.find({ type: 'Button', text: /Release/ })) == null).toBe(true)
    await survey.unmount()
  }
})
