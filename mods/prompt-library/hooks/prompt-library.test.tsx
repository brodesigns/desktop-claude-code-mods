import { expect, mock, test } from 'claude-code/testing'

import { shortHash } from './hash'
import { idOf } from './library'
import { projectOf } from './project'

const ROOT = '/home/x/demo'
const PROJECT_KEY = projectOf(ROOT, 'prompts').key
const COMPOSER = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
const PANE = {
  plugin: 'prompt-library',
  component: 'Pane',
  requestId: 'prompt-library',
  props: { title: 'Prompts', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type OnLike = Parameters<typeof mock.store>[0]

// The engine beneath the plugin: a root, a clock, a store in memory, and commands that register.
function world(on: OnLike, entries: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...entries }
  on('session.root', () => ({ value: ROOT }))
  on('clock.now', () => ({ value: 1000 }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete store[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(store) }))

  return store
}

const run = ($: { command: { run: (a: never) => Promise<{ text?: string }> } }, command: string, args: string) =>
  $.command.run({ command, args, ...COMPOSER } as never)

const prompt = (scope: 'global' | 'project', name: string, text: string, at = 1) => ({ id: idOf(scope, name), name, text, at })

test('/prompt-save saves globally and says so', async ($, on) => {
  const store = world(on)
  const res = await run($, 'prompt-save', 'review: Check {{file}} for errors.')
  expect(res.text).toContain('"review" saved (all projects)')
  expect(store['prompts:global']).toEqual([prompt('global', 'review', 'Check {{file}} for errors.', 1000)])

  const again = await run($, 'prompt-save', 'review: New text')
  expect(again.text).toContain('updated')
  expect((store['prompts:global'] as unknown[]).length).toBe(1)
})

test('/prompt-save --project keeps a multi-line prompt for this project only', async ($, on) => {
  const store = world(on)
  const res = await run($, 'prompt-save', '--project deploy:\nBuild the project.\nThen deploy.')
  expect(res.text).toContain('only this project')
  expect(store[PROJECT_KEY]).toEqual([prompt('project', 'deploy', 'Build the project.\nThen deploy.', 1000)])
  expect(store['prompts:global']).toBe(undefined)
})

test('a wrong syntax saves nothing and says how', async ($, on) => {
  const store = world(on)
  expect((await run($, 'prompt-save', 'just text without a colon')).text).toContain('Not saved: please write it like this')
  expect((await run($, 'prompt-save', 'empty:   ')).text).toContain('prompt text is missing')
  expect((await run($, 'prompt-save', `${'x'.repeat(41)}: text`)).text).toContain('at most 40')
  expect(Object.keys(store).length).toBe(0)
})

test('a store that refuses is reported, not called saved', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  on('clock.now', () => ({ value: 1 }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => {
    throw new Error('store full')
  })
  const res = await run($, 'prompt-save', 'a: b')
  expect(res.text).toContain('Not saved')
  expect(res.text?.includes('saved (') ?? false).toBe(false)
})

test('a key in a prompt is masked before it is stored', async ($, on) => {
  const store = world(on)
  const token = 'gh' + 'p_' + 'a'.repeat(36)
  const res = await run($, 'prompt-save', `api: Use ${token} for the API.`)
  expect(res.text).toContain('redacted')
  expect(JSON.stringify(store['prompts:global'])).not.toContain(token)
  expect(JSON.stringify(store['prompts:global'])).toContain('[secret removed]')
})

test('/p fills the placeholders in order and puts the text in the prompt box', async ($, on) => {
  world(on, { 'prompts:global': [prompt('global', 'review', 'Check {{file}} at {{level}}.'), prompt('global', 'short', 'Summarize.')] })
  const filled: { text: string }[] = []
  on('prompt.fill', (_, e) => {
    filled.push({ text: e.text })
    return { isFilled: true }
  })

  expect((await run($, 'p', 'review src/a.ts | strict')).text).toBe('"review" is in the prompt box.')
  expect(filled[0]).toEqual({ text: 'Check src/a.ts at strict.' })

  expect((await run($, 'p', 'Review')).text).toContain('Still open: {{file}}, {{level}}')
  expect(filled[1]).toEqual({ text: 'Check {{file}} at {{level}}.' })

  expect((await run($, 'p', 'short in English please')).text).toContain('is in the prompt box')
  expect(filled[2]?.text).toBe('Summarize.\n\nin English please')

  expect((await run($, 'p', 'missing')).text).toContain('No prompt "missing"')
})

test('/p without a prompt box shows the text to copy', async ($, on) => {
  world(on, { [PROJECT_KEY]: [prompt('project', 'deploy', 'Deploy now.')] })
  on('prompt.fill', () => ({ isFilled: false, refusal: 'no_composer' as const }))
  on('ui.copy', () => ({ value: { isCopied: false as const, reason: 'no-surface' as const } }))
  const res = await run($, 'p', 'deploy')
  expect(res.text).toContain('Prompt box unreachable')
  expect(res.text).toContain('Deploy now.')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane on ${surface}: empty, then filled, use and delete`, async ($, on) => {
    const store = world(on)
    const filled: string[] = []
    on('prompt.fill', (_, e) => {
      filled.push(e.text)
      return { isFilled: true }
    })
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })

    const empty = await $.ui.mount({ ...PANE, surface })
    expect((await empty.find({ type: 'Text', text: /No prompts yet/ })) != null).toBe(true)
    await empty.unmount()

    await run($, 'prompt-save', 'review: Check {{file}} thoroughly.')
    await run($, 'prompt-save', '--project short: Sum up the state in three sentences, with a very long text after it.')

    for (const bodyColumns of [36, 90]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect((await ui.find({ type: 'Text', text: /^2$/ })) != null).toBe(true)
      expect((await ui.find({ type: 'Text', text: /▣/ })) != null).toBe(true)
      await ui.unmount()
    }

    const ui = await $.ui.mount({ ...PANE, surface })
    const short = shortHash(idOf('project', 'short'))
    const review = shortHash(idOf('global', 'review'))

    await ui.press({ key: `use-${short}` })
    expect(filled).toEqual(['Sum up the state in three sentences, with a very long text after it.'])
    expect((await ui.find({ type: 'Text', text: /is in the prompt box/ })) != null).toBe(true)

    // A prompt with a placeholder asks for its value first, then uses it.
    await ui.press({ key: `use-${review}` })
    expect(filled.length).toBe(1)
    await ui.input({ key: `val-${review}-0`, text: 'src/app.ts', kind: 'change' })
    await ui.press({ key: `use-${review}` })
    expect(filled[1]).toBe('Check src/app.ts thoroughly.')

    // A short list has no search field.
    expect((await ui.find({ type: 'Input', text: /Search/ })) == null).toBe(true)

    await ui.press({ key: `open-${short}` })
    await ui.press({ key: `rm-${short}` })
    expect(store[PROJECT_KEY]).toEqual([])
    expect((await ui.find({ type: 'Text', text: /^1$/ })) != null).toBe(true)

    // Saving from the pane's own field, for this project; the field opens with "＋ new".
    await ui.press({ key: 'new' })
    await ui.press({ key: 'scope-project' })
    await ui.input({ key: 'new-input', text: 'fresh: A new prompt' })
    expect((store[PROJECT_KEY] as { name: string }[])[0]?.name).toBe('fresh')
    await ui.unmount()
  })
}

test('without a prompt box and clipboard the pane opens the full text', async ($, on) => {
  world(on, { 'prompts:global': [prompt('global', 'long', 'Line one\nLine two')] })
  on('prompt.fill', () => ({ isFilled: false, refusal: 'no_composer' as const }))
  on('ui.copy', () => ({ value: { isCopied: false as const, reason: 'no-surface' as const } }))
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: `use-${shortHash(idOf('global', 'long'))}` })
  expect((await ui.find({ type: 'Text', text: /Line two/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Text', text: /Select and copy/ })) != null).toBe(true)
  await ui.unmount()
})
