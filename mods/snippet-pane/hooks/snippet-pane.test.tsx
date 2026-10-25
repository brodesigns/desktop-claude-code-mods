import { expect, mock, test } from 'claude-code/testing'

import { projectOf } from './project'
import { guessLang, parseSnippet } from './snippets'

const ROOT = '/home/x/demo'
const KEY = projectOf(ROOT, 'snippets').key
const COMPOSER = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
const PANE = {
  plugin: 'snippet-pane',
  component: 'Pane',
  requestId: 'snippet-pane',
  props: { title: 'Snippets', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type OnLike = Parameters<typeof mock.store>[0]

// The engine beneath the plugin: a root, a clock, a store in memory, commands that register.
const time = { now: 1000 }

function world(on: OnLike, entries: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...entries }
  time.now = 1000
  on('session.root', () => ({ value: ROOT }))
  on('clock.now', () => ({ value: time.now }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
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

const snip = (id: number, title: string, lang: string, code: string, masked = 0) => ({ id, title, lang, code, at: 1, masked })
const LONG = Array.from({ length: 12 }, (_, i) => `echo "Line ${i + 1} with a long text that gets cut off in a narrow pane"`).join('\n')

test('the syntax: next lines, a bar, a fence with its language', () => {
  expect(parseSnippet('Hello\n```ts\nconst a: number = 1\n```')).toEqual({ title: 'Hello', code: 'const a: number = 1', lang: 'ts' })
  expect(parseSnippet('List | ls -la | grep x')).toEqual({ title: 'List', code: 'ls -la | grep x', lang: 'sh' })
  expect(parseSnippet('Py\ndef f(x):\n    return x')).toEqual({ title: 'Py', code: 'def f(x):\n    return x', lang: 'py' })
  expect(parseSnippet('just a title')).toEqual({ error: 'code' })
  expect(parseSnippet('   ')).toEqual({ error: 'title' })
  expect(parseSnippet('Empty |   ')).toEqual({ error: 'code' })
  expect(guessLang('{ "a": 1 }')).toBe('json')
  expect(guessLang('SELECT * FROM users')).toBe('sql')
  expect(guessLang('.box { color: red; }')).toBe('css')
  expect(guessLang('<div class="x"></div>')).toBe('html')
  expect(guessLang('some plain words')).toBe('text')
})

test('/snippet saves for this project and says what it saved', async ($, on) => {
  const store = world(on)
  const res = await run($, 'snippet', 'Import\nimport { a } from "b"\nconst x: string = a')
  expect(res.text).toBe('Snippet "Import" saved (ts, 2 lines) for demo.')
  expect(store[KEY]).toEqual([{ id: 1, title: 'Import', lang: 'ts', code: 'import { a } from "b"\nconst x: string = a', at: 1000, masked: 0 }])
  await run($, 'snippet', 'Two | git status')
  expect((store[KEY] as { id: number }[]).map(s => s.id)).toEqual([1, 2])
})

test('/snippet masks secrets and warns', async ($, on) => {
  const store = world(on)
  const token = 'gh' + 'p_' + 'b'.repeat(36)
  const res = await run($, 'snippet', `Login\ncurl -H "Authorization: token ${token}" https://api.example`)
  expect(res.text).toContain('Warning: 1 place looked like a key and was redacted.')
  expect(JSON.stringify(store[KEY])).not.toContain(token)
  expect((store[KEY] as { masked: number }[])[0]?.masked).toBe(1)
})

test('a wrong syntax or a refusing store saves nothing and says so', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  on('clock.now', () => ({ value: 1 }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => {
    throw new Error('store full')
  })
  expect((await run($, 'snippet', 'just a title')).text).toContain('Not saved: The code is missing.')
  expect((await run($, 'snippet', 'T | ls')).text).toContain('Not saved: the plugin store')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane on ${surface}: one line each, open, insert, delete, save`, async ($, on) => {
    const store = world(on)
    const filled: { text: string; mode: string }[] = []
    on('prompt.fill', (_, e) => {
      filled.push({ text: e.text, mode: e.mode })
      return { isFilled: true }
    })
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })

    const empty = await $.ui.mount({ ...PANE, surface })
    expect((await empty.find({ type: 'Text', text: /No snippets for demo yet/ })) != null).toBe(true)
    await empty.unmount()

    store[KEY] = [snip(1, 'Long', 'sh', LONG), snip(2, 'Secret', 'ts', 'const k = "[secret removed]"', 1)]
    await run($, 'snippets', '')

    for (const bodyColumns of [36, 90]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect((await ui.find({ type: 'Text', text: /Long/ })) != null).toBe(true)
      expect((await ui.find({ type: 'Text', text: /ts ⚠/ })) != null).toBe(true)
      // Closed: no code in the tree.
      expect((await ui.find({ type: 'Text', text: /Line 1 with/ })) == null).toBe(true)
      await ui.unmount()
    }

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'open-1' })
    expect((await ui.find({ type: 'Text', text: /Line 12 with/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /12 lines/ })) != null).toBe(true)

    await ui.press({ key: 'ins-2' })
    expect(filled[0]).toEqual({ text: '```ts\nconst k = "[secret removed]"\n```\n', mode: 'insert' })

    await ui.press({ key: 'rm-1' })
    expect((store[KEY] as { id: number }[]).map(s => s.id)).toEqual([2])
    expect((await ui.find({ type: 'Text', text: /"Long" deleted/ })) != null).toBe(true)

    // The field for a new snippet only exists after "＋ new".
    expect((await ui.find({ type: 'Input' })) == null).toBe(true)
    await ui.press({ key: 'new' })
    await ui.input({ key: 'new-input', text: 'Fresh\nnpm run build' })
    expect((store[KEY] as { title: string; lang: string }[])[1]).toMatchObject({ title: 'Fresh', lang: 'sh' })
    // Saved: the field closed, so Enter cannot save it twice.
    expect((await ui.find({ type: 'Input' })) == null).toBe(true)
    await ui.unmount()
  })
}

test('the note goes away after 8 seconds and when the field is toggled', async ($, on) => {
  const store = world(on, { [KEY]: [snip(1, 'One', 'sh', 'ls')] })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'open-1' })
  await ui.press({ key: 'rm-1' })
  expect(store[KEY]).toEqual([])
  expect((await ui.find({ type: 'Text', text: /"One" deleted/ })) != null).toBe(true)
  await ui.unmount()

  time.now = 1000 + 7999
  const soon = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await soon.find({ type: 'Text', text: /"One" deleted/ })) != null).toBe(true)
  await soon.unmount()

  time.now = 1000 + 8000
  const later = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await later.find({ type: 'Text', text: /"One" deleted/ })) == null).toBe(true)
  await later.unmount()

  // Toggling the field clears a fresh note.
  time.now = 1000
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await again.find({ type: 'Text', text: /"One" deleted/ })) != null).toBe(true)
  await again.press({ key: 'new' })
  expect((await again.find({ type: 'Text', text: /"One" deleted/ })) == null).toBe(true)
  await again.unmount()
})

test('another session\'s changes show after a turn; a delete never removes a different entry that got the same id', async ($, on) => {
  const store = world(on, { [KEY]: [snip(1, 'Mine', 'sh', 'ls')] })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Mine/ })) != null).toBe(true)

  // Another session adds a snippet; this pane does not know yet.
  store[KEY] = [snip(1, 'Mine', 'sh', 'ls'), { ...snip(2, 'Theirs', 'sh', 'pwd'), at: 5 }]
  expect((await ui.find({ type: 'Text', text: /Theirs/ })) == null).toBe(true)
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  expect((await ui.find({ type: 'Text', text: /Theirs/ })) != null).toBe(true)

  // Another session deletes id 1 and a new entry takes the id; the stale view deletes nothing of it.
  await ui.press({ key: 'open-1' })
  store[KEY] = [{ ...snip(1, 'Other', 'sh', 'date'), at: 99 }]
  await ui.press({ key: 'rm-1' })
  expect((store[KEY] as { title: string }[]).map(x => x.title)).toEqual(['Other'])
  await ui.unmount()
})
