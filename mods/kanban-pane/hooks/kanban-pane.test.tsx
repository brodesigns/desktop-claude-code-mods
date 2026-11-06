import { expect, mock, test } from 'claude-code/testing'

import { capDone, DAY_MS, parseCards, splitDone, step } from './board'
import { projectOf } from './project'

const ROOT = '/home/x/demo'
const KEY = projectOf(ROOT, 'kanban').key
const NOW = 100 * DAY_MS
const COMPOSER = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
const PANE = {
  plugin: 'kanban-pane',
  component: 'Pane',
  requestId: 'kanban-pane',
  props: { title: 'Kanban', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type OnLike = Parameters<typeof mock.store>[0]
type Card = { id: number; text: string; col: string; at: number; movedAt: number }

// The engine beneath the plugin: a root, a fixed clock, a store in memory, commands that register.
function world(on: OnLike, entries: Record<string, unknown> = {}, clock = { now: NOW }) {
  const store: Record<string, unknown> = { ...entries }
  on('session.root', () => ({ value: ROOT }))
  on('clock.now', () => ({ value: clock.now }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })

  return store
}

const run = ($: { command: { run: (a: never) => Promise<{ text?: string }> } }, command: string, args: string) =>
  $.command.run({ command, args, ...COMPOSER } as never)

const kc = (id: number, text: string, col: string, movedAt = NOW - 1000, at = 1): Card => ({ id, text, col, at, movedAt })
const cards = (store: Record<string, unknown>) => store[KEY] as Card[]

test('lines become cards; steps stop at the edges; old done cards fold', () => {
  expect(parseCards('- Build login\n\n* Write tests ')).toEqual(['Build login', 'Write tests'])
  expect(step('open', -1)).toBe(undefined)
  expect(step('open', 1)).toBe('doing')
  expect(step('done', 1)).toBe(undefined)
  const split = splitDone([kc(1, 'old', 'done', NOW - 15 * DAY_MS) as never, kc(2, 'fresh', 'done', NOW - DAY_MS) as never], NOW, 14)
  expect(split.old.map(c => c.id)).toEqual([1])
  expect(split.recent.map(c => c.id)).toEqual([2])
  const many = [kc(1, 'o', 'open'), ...Array.from({ length: 202 }, (_, i) => kc(i + 2, 'd', 'done', i))]
  const capped = capDone(many as never) as Card[]
  expect(capped.filter(c => c.col === 'done')).toHaveLength(200)
  expect(capped.some(c => c.id === 2 || c.id === 3)).toBe(false)
  expect(capped.some(c => c.id === 1)).toBe(true)
})

test('/card adds to Open for this project and says so', async ($, on) => {
  const store = world(on)
  expect((await run($, 'card', 'Build the login page')).text).toBe('Card saved in Open (demo).')
  expect(cards(store)).toEqual([{ id: 1, text: 'Build the login page', col: 'open', at: NOW, movedAt: NOW }])
  expect((await run($, 'card', 'A\nB')).text).toBe('2 cards saved in Open (demo).')
  expect(cards(store).map(c => c.id)).toEqual([1, 2, 3])
})

test('/card without text or with a refusing store saves nothing and says so', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  on('clock.now', () => ({ value: NOW }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => {
    throw new Error('store full')
  })
  expect((await run($, 'card', '   ')).text).toContain('Nothing saved')
  expect((await run($, 'card', 'x')).text).toContain('Not saved: the plugin store')
})

test('/card masks a key', async ($, on) => {
  const store = world(on)
  const token = 'sk-' + 'c'.repeat(30)
  expect((await run($, 'card', `Rotate key ${token} now`)).text).toContain('redacted')
  expect(cards(store)[0]?.text).toBe('Rotate key [secret removed] now')
})

const mountPane = ($: Parameters<Parameters<typeof test>[1]>[0], surface: 'terminal' | 'desktop', bodyColumns = 40) =>
  $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the board on ${surface}: one line per card, forward, open, delete, new`, async ($, on) => {
    const store = world(on)
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })

    // An empty board shows only the empty state, no sections.
    const empty = await mountPane($, surface)
    expect((await empty.find({ type: 'Text', text: /No cards for demo yet/ })) != null).toBe(true)
    expect((await empty.find({ type: 'Text', text: /Open/ })) == null).toBe(true)
    await empty.unmount()

    store[KEY] = [
      kc(1, 'Build the login page, with a very long text that has to wrap', 'open'),
      kc(2, 'Connect the API', 'doing'),
      kc(3, 'Done long ago', 'done', NOW - 20 * DAY_MS),
      kc(4, 'Done recently', 'done', NOW - DAY_MS),
    ]
    await run($, 'kanban', '')

    for (const bodyColumns of [36, 100]) {
      const narrow = await mountPane($, surface, bodyColumns)
      expect((await narrow.find({ type: 'Text', text: /In progress/ })) != null).toBe(true)
      expect((await narrow.find({ type: 'Text', text: /○ Connect the API/ })) != null).toBe(true)
      await narrow.unmount()
    }

    const ui = await mountPane($, surface, 100)
    // One line per card: no border boxes, no per-card buttons except the text and `›`.
    expect((await ui.find({ type: 'Text', text: /○ Build the login page/ })) != null).toBe(true)
    expect((await ui.find({ key: 'rm-1' })) == null).toBe(true)
    expect((await ui.find({ key: 'back-2' })) == null).toBe(true)
    // The input is hidden behind "＋ new".
    expect((await ui.find({ type: 'Input' })) == null).toBe(true)
    // Done older than 14 days is folded until asked; Done has no forward button.
    expect((await ui.find({ type: 'Text', text: /Done long ago/ })) == null).toBe(true)
    expect((await ui.find({ key: 'old' }))?.text).toBe('▸ 1 older than 14 days')
    await ui.press({ key: 'old' })
    expect((await ui.find({ type: 'Text', text: /Done long ago/ })) != null).toBe(true)
    expect((await ui.find({ key: 'fwd-4' })) == null).toBe(true)

    await ui.press({ key: 'fwd-1' })
    expect(cards(store).find(c => c.id === 1)?.col).toBe('doing')
    await ui.press({ key: 'fwd-1' })
    expect(cards(store).find(c => c.id === 1)?.col).toBe('done')

    // Opened: back and delete show up.
    await ui.press({ key: 'open-2' })
    expect((await ui.find({ key: 'back-2' })) != null).toBe(true)
    await ui.press({ key: 'back-2' })
    expect(cards(store).find(c => c.id === 2)?.col).toBe('open')
    await ui.press({ key: 'open-3' })
    await ui.press({ key: 'rm-3' })
    expect(cards(store).map(c => c.id)).toEqual([1, 2, 4])
    expect((await ui.find({ key: 'card-3' })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /"Done long ago" deleted/ })) != null).toBe(true)

    // "＋ new" shows the input and clears the note; a saved card closes it again.
    await ui.press({ key: 'new' })
    expect((await ui.find({ type: 'Text', text: /deleted/ })) == null).toBe(true)
    await ui.input({ key: 'new-card', text: 'New card from the pane' })
    expect(cards(store).at(-1)).toMatchObject({ id: 5, col: 'open', text: 'New card from the pane' })
    expect((await ui.find({ type: 'Input' })) == null).toBe(true)
    await ui.unmount()
  })
}

for (const action of ['fwd-1', 'rm-1']) {
  test(`a stale view does not touch a card that reused the id (${action})`, async ($, on) => {
    const store = world(on, { [KEY]: [kc(1, 'Mine', 'open', NOW - 1000, 1)] })
    await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
    const ui = await mountPane($, 'desktop')
    // Another session deletes card 1 and adds a new one that gets the same id.
    store[KEY] = [kc(1, 'Theirs', 'open', NOW - 500, 999)]
    await ui.press({ key: 'open-1' })
    await ui.press({ key: action })
    expect(cards(store)).toEqual([kc(1, 'Theirs', 'open', NOW - 500, 999)])
    await ui.unmount()
  })
}

test('the note about the last action expires', async ($, on) => {
  const clock = { now: NOW }
  world(on, { [KEY]: [kc(1, 'Mine', 'open')] }, clock)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'open-1' })
  await ui.press({ key: 'rm-1' })
  expect((await ui.find({ type: 'Text', text: /deleted/ })) != null).toBe(true)
  clock.now = NOW + 9000
  await ui.press({ key: 'new' })
  expect((await ui.find({ type: 'Text', text: /deleted/ })) == null).toBe(true)
  await ui.unmount()
})

test('the fold follows userConfig', { options: { doneDays: 30 } }, async ($, on) => {
  world(on, { [KEY]: [kc(3, 'Done long ago', 'done', NOW - 20 * DAY_MS)] })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Done long ago/ })) != null).toBe(true)
  expect((await ui.find({ key: 'old' })) == null).toBe(true)
  await ui.unmount()
})

test('a long column draws 30 cards and a "+N more" row; nothing is lost', async ($, on) => {
  const store = world(on, { [KEY]: Array.from({ length: 45 }, (_, i) => kc(i + 1, `Card ${i + 1}`, 'open', i)) })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await mountPane($, 'desktop')
  expect((await ui.find({ key: 'card-30' })) != null).toBe(true)
  expect((await ui.find({ key: 'card-31' })) == null).toBe(true)
  expect((await ui.find({ key: 'more-open' }))?.text).toBe('+15 more')
  await ui.press({ key: 'more-open' })
  expect((await ui.find({ key: 'card-45' })) != null).toBe(true)
  expect((await ui.find({ key: 'more-open' })) == null).toBe(true)
  await ui.press({ key: 'less-open' })
  expect((await ui.find({ key: 'card-31' })) == null).toBe(true)
  expect(cards(store)).toHaveLength(45)
  await ui.unmount()
})
