import { expect, mock, test } from 'claude-code/testing'

import { DAY_MS, parseCards, splitDone, step } from './board'
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
function world(on: OnLike, entries: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...entries }
  on('session.root', () => ({ value: ROOT }))
  on('clock.now', () => ({ value: NOW }))
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

const kc = (id: number, text: string, col: string, movedAt = NOW - 1000): Card => ({ id, text, col, at: 1, movedAt })
const cards = (store: Record<string, unknown>) => store[KEY] as Card[]

test('lines become cards; steps stop at the edges; old done cards fold', () => {
  expect(parseCards('- Build login\n\n* Write tests ')).toEqual(['Build login', 'Write tests'])
  expect(step('open', -1)).toBe(undefined)
  expect(step('open', 1)).toBe('doing')
  expect(step('done', 1)).toBe(undefined)
  const split = splitDone([kc(1, 'old', 'done', NOW - 15 * DAY_MS) as never, kc(2, 'fresh', 'done', NOW - DAY_MS) as never], NOW, 14)
  expect(split.old.map(c => c.id)).toEqual([1])
  expect(split.recent.map(c => c.id)).toEqual([2])
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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the board on ${surface}: empty, filled, move, delete, fold`, async ($, on) => {
    const store = world(on)
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })

    const empty = await $.ui.mount({ ...PANE, surface })
    expect((await empty.find({ type: 'Text', text: /No cards for demo yet/ })) != null).toBe(true)
    await empty.unmount()

    store[KEY] = [
      kc(1, 'Build the login page, with a very long text that has to wrap', 'open'),
      kc(2, 'Connect the API', 'doing'),
      kc(3, 'Done long ago', 'done', NOW - 20 * DAY_MS),
      kc(4, 'Done recently', 'done', NOW - DAY_MS),
    ]
    await run($, 'kanban', '')

    // Narrow and wide: both draw every column and its count.
    for (const bodyColumns of [36, 100]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect((await ui.find({ type: 'Text', text: /In progress/ })) != null).toBe(true)
      expect((await ui.find({ type: 'Text', text: /Done recently/ })) != null).toBe(true)
      await ui.unmount()
    }

    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface })
    // Done older than 14 days is folded until asked.
    expect((await ui.find({ type: 'Text', text: /Done long ago/ })) == null).toBe(true)
    expect((await ui.find({ key: 'old' }))?.text).toBe('▸ 1 older than 14 days')
    await ui.press({ key: 'old' })
    expect((await ui.find({ type: 'Text', text: /Done long ago/ })) != null).toBe(true)

    expect((await ui.find({ key: 'card-3' })) != null).toBe(true)
    // Open has no left button, Done no right one.
    expect((await ui.find({ key: 'left-1' })) == null).toBe(true)
    expect((await ui.find({ key: 'right-4' })) == null).toBe(true)

    await ui.press({ key: 'right-1' })
    expect(cards(store).find(c => c.id === 1)?.col).toBe('doing')
    await ui.press({ key: 'right-1' })
    expect(cards(store).find(c => c.id === 1)?.col).toBe('done')
    await ui.press({ key: 'left-2' })
    expect(cards(store).find(c => c.id === 2)?.col).toBe('open')

    await ui.press({ key: 'rm-3' })
    expect(cards(store).map(c => c.id)).toEqual([1, 2, 4])
    expect((await ui.find({ key: 'card-3' })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /"Done long ago" deleted/ })) != null).toBe(true)

    await ui.input({ key: 'new-card', text: 'New card from the pane' })
    expect(cards(store).at(-1)).toMatchObject({ id: 5, col: 'open', text: 'New card from the pane' })
    await ui.unmount()
  })
}

test('the fold follows userConfig', { options: { doneDays: 30 } }, async ($, on) => {
  world(on, { [KEY]: [kc(3, 'Done long ago', 'done', NOW - 20 * DAY_MS)] })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Done long ago/ })) != null).toBe(true)
  expect((await ui.find({ key: 'old' })) == null).toBe(true)
  await ui.unmount()
})
