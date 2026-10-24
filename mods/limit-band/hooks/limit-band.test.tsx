import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { clockAt, span } from './time'

const SURFACES = ['terminal', 'desktop'] as const
// Local time, so the test reads the same in every time zone.
const NOW = new Date(2026, 9, 23, 10, 0, 0).getTime()
const MIN = 60_000

const band = (bodyColumns = 100, hasSurvey = false) =>
  ({
    plugin: 'limit-band',
    component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as never

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type OnLike = (event: string, hook: (_: unknown, e: unknown) => unknown) => void

// The account's windows as `$.session.usage()` answers them; `limits` is read on every call.
const usage = (on: OnLike, limits: () => Limit[]) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: limits() } }))
  // Nothing sits beneath the plugin: these stand for the engine's own steps.
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }))
  on('session.measure', (_, e) => ({ changed: (e as { changed: string[] }).changed }))
}

const iso = (ms: number) => new Date(ms).toISOString()

// The engine's own band: what shows when the mod passes.
const engineBand = (on: On) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
}

// The colour of the innermost Text the pattern finds (the outer line carries none).
// The band's own framed Box (the outer column carries no border).
type Boxes = { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }
const borderOf = async (ui: Boxes) => (await ui.findAll({ type: 'Box' })).map(b => b.props.borderColor).find(c => c !== undefined)

type Found = { findAll: (q: { type: string; text: RegExp }) => Promise<{ props: Record<string, unknown> }[]> }
const colorOf = async (ui: Found, text: RegExp) => (await ui.findAll({ type: 'Text', text })).map(f => f.props.color).find(c => c !== undefined)

test('span and clock time read in English', () => {
  expect(span(30_000)).toBe('less than 1 min')
  expect(span(12 * MIN + 59_000)).toBe('12 min')
  expect(span(83 * MIN + 30_000)).toBe('1 h 23 min')
  expect(span(2 * 60 * MIN)).toBe('2 h')
  expect(span(24 * 60 * MIN + 5 * MIN)).toBe('1 day')
  expect(span(51 * 60 * MIN)).toBe('2 days 3 h')
  expect(clockAt(NOW + 83 * MIN, NOW)).toBe('11:23')
  expect(clockAt(new Date(2026, 9, 24, 9, 5).getTime(), NOW)).toBe('Sat 09:05')
})

test('over the threshold the band counts down to the reset, on the timer', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engineBand(on)
  usage(on as never, () => [{ kind: 'five_hour', percentUsed: 72.4, resetsAt: iso(NOW + 83 * MIN + 30_000) }])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...(band() as object), surface } as never)
    const head = await ui.find({ type: 'Text', text: /5h limit/ })
    expect(head?.text).toContain('◔ 5h limit 72%')
    expect(head?.text).toContain('resets in 1 h 23 min (11:23)')
    // The bands beneath (here the engine's stand-in) still draw under it.
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }

  await clock.advance(30 * MIN)
  const ui = await $.ui.mount({ ...(band() as object), surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text', text: /5h limit/ }))?.text).toContain('resets in 53 min')
  await ui.unmount()
})

test('warning from 80, error from 95, both windows side by side', async ($, on) => {
  mock.clock(on, { now: NOW })
  engineBand(on)
  usage(on as never, () => [
    { kind: 'five_hour', percentUsed: 81, resetsAt: iso(NOW + 2 * 60 * MIN) },
    { kind: 'seven_day', percentUsed: 96, resetsAt: iso(NOW + 51 * 60 * MIN) },
  ])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...(band() as object), surface } as never)
    expect(await borderOf(ui as never)).toBe('error')
    expect(await colorOf(ui as never, /^⚠ 7-day limit/)).toBe('error')
    expect((await ui.find({ type: 'Text', text: /7-day limit 96/ }))?.text).toContain('resets in 2 days 3 h')
    expect(await colorOf(ui as never, /^◕ 5h limit/)).toBe('warning')
    await ui.unmount()

    // Narrow: only the fullest window.
    const slim = await $.ui.mount({ ...(band(40) as object), surface } as never)
    expect((await slim.find({ type: 'Text', text: /5h limit/ })) == null).toBe(true)
    expect((await slim.find({ type: 'Text', text: /7-day limit/ })) != null).toBe(true)
    await slim.unmount()
  }
})

test('below the threshold, without limits, after the reset and under a survey the band stays hidden', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  let limits: Limit[] = [{ kind: 'five_hour', percentUsed: 49, resetsAt: iso(NOW + 10 * MIN) }]
  usage(on as never, () => limits)
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const hidden = async () => {
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...(band() as object), surface } as never)
      expect((await ui.find({ type: 'Text', text: /limit/ })) == null).toBe(true)
      expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
      await ui.unmount()
    }
  }
  await hidden()

  limits = []
  await clock.advance(30_000)
  await hidden()

  // 90% but the window resets in 10 min; 11 min later the reading is stale.
  limits = [{ kind: 'five_hour', percentUsed: 90, resetsAt: iso(NOW + 10 * MIN) }]
  await clock.advance(30_000)
  const shown = await $.ui.mount({ ...(band() as object), surface: 'desktop' } as never)
  expect((await shown.find({ type: 'Text', text: /5h limit 90/ })) != null).toBe(true)
  await shown.unmount()
  const survey = await $.ui.mount({ ...(band(100, true) as object), surface: 'desktop' } as never)
  expect((await survey.find({ type: 'Text', text: /limit/ })) == null).toBe(true)
  await survey.unmount()
  await clock.advance(10 * MIN)
  await hidden()
})

test('the threshold and the 7-day switch come from the options', { options: { threshold: 90, sevenDay: false } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  usage(on as never, () => [
    { kind: 'five_hour', percentUsed: 85, resetsAt: iso(NOW + 60 * MIN) },
    { kind: 'seven_day', percentUsed: 99, resetsAt: iso(NOW + 26 * 60 * MIN) },
  ])
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...(band() as object), surface } as never)
    expect((await ui.find({ type: 'Text', text: /limit/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('a session.measure moves the band without a usage call', async ($, on) => {
  mock.clock(on, { now: NOW })
  usage(on as never, () => [])
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 97, resetsAt: iso(NOW + 5 * MIN) }],
    changed: ['rateLimits'],
  } as never)

  const ui = await $.ui.mount({ ...(band() as object), surface: 'terminal' } as never)
  expect(await colorOf(ui as never, /^⚠ 5h limit 97/)).toBe('error')
  expect((await ui.find({ type: 'Text', text: /5h limit/ }))?.text).toContain('resets in 5 min')
  await ui.unmount()
})
