import { expect, mock, test } from 'claude-code/testing'

import { buildPrompt, clip, digestTurn, parseSummary } from './digest'
import { redact } from './keys'

const PANE = {
  plugin: 'session-summary',
  component: 'Pane',
  requestId: 'session-summary',
  props: { title: 'Summary', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type OnLike = Parameters<typeof import('claude-code/testing').mock.store>[0]

const USAGE = { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// The engine beneath the plugin: commands that register, a model that answers from a queue, the end of a turn.
// What the plugin store holds for the pane's switch.
const stored: { value: unknown } = { value: undefined }

function world(on: OnLike, replies: string[], seen: { model: string; prompt: string; maxTokens?: number }[] = []) {
  stored.value = undefined
  const clock = mock.clock(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: {} }))
  on('store.get', () => ({ value: stored.value }))
  on('store.set', (_, e) => {
    stored.value = e.value
    return { value: undefined }
  })
  on('model.complete', (_, e) => {
    seen.push({ model: e.model, prompt: e.prompt as string, maxTokens: e.maxTokens })
    const text = replies.shift()
    return { value: text === undefined ? { isAnswered: false as const, reason: 'api-error' as const, status: 529, error: 'overloaded' } : { isAnswered: true as const, text, usage: USAGE } }
  })

  return clock
}

// The update runs unawaited after the turn ends; advancing the mocked clock lets it settle.
async function finish($: { turn: { complete: (a: never) => Promise<unknown> } }, clock: { advance: (ms: number) => Promise<void> }, answer: string) {
  await $.turn.complete({ answer, durationMs: 10, isAborted: false, turnId: 't', reason: 'answer' } as never)
  await clock.advance(0)
}

test('digests are short, redacted text; the reply becomes at most five clean bullets', () => {
  expect(clip('  a\n\n b   c ', 10)).toBe('a b c')
  expect(clip('x'.repeat(50), 10)).toBe('xxxxxxxxx…')
  const digest = digestTurn('Fix the login', ['a.ts', 'b.ts'], 'Done, tests pass.')
  expect(digest).toBe('Asked: Fix the login\nWrote: a.ts, b.ts\nAnswer: Done, tests pass.')
  expect(buildPrompt('', [digest])).toContain('(none yet)')
  expect(parseSummary('Here:\n- one\n* two\n3. three\n\n- four\n- five\n- six')).toBe('- Here:\n- one\n- two\n- three\n- four')
  const token = 'gh' + 'p_' + 'a'.repeat(36)
  expect(redact(`key ${token}`)).not.toContain(token)
})

test('after a turn the cheap model gets a small digest, the pane shows the bullets and what it cost', async ($, on) => {
  const seen: { model: string; prompt: string; maxTokens?: number }[] = []
  const clock = world(on, ['- Fixed the login redirect\n- Added a test'], seen)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  await $.prompt.submit({ text: 'Fix the login redirect' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/p/src/login.ts', old_string: 'a', new_string: 'b', replace_all: false })
  await finish($ as never, clock, 'The redirect works now.')

  expect(seen.length).toBe(1)
  expect(seen[0]?.model).toBe('haiku')
  expect(seen[0]?.maxTokens).toBe(220)
  expect(seen[0]?.prompt).toContain('Asked: Fix the login redirect')
  expect(seen[0]?.prompt).toContain('Wrote: login.ts')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Fixed the login redirect/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /1 turn · haiku · 340 tokens/ })) != null).toBe(true)
    await ui.unmount()
  }
})

test('the next turn sends the summary so far plus only the new digest', async ($, on) => {
  const seen: { model: string; prompt: string }[] = []
  const clock = world(on, ['- First', '- First\n- Second'], seen)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'one' } as never)
  await finish($ as never, clock, 'answer one')
  await $.prompt.submit({ text: 'two' } as never)
  await finish($ as never, clock, 'answer two')

  expect(seen[1]?.prompt).toContain('- First')
  expect(seen[1]?.prompt).toContain('Asked: two')
  expect(seen[1]?.prompt).not.toContain('Asked: one')
})

test('a failing model call keeps the digest and the button tries again', async ($, on) => {
  const seen: { model: string; prompt: string }[] = []
  const clock = world(on, [], seen)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'something' } as never)
  await finish($ as never, clock, 'done')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Not updated: API error 529/ })) != null).toBe(true)
  await ui.press({ key: 'update' })
  expect(seen.length).toBe(2)
  await ui.unmount()
})

test('auto off: nothing is sent until the button is pressed; a subagent turn is ignored', { options: { auto: false, model: 'sonnet' } }, async ($, on) => {
  const seen: { model: string; prompt: string }[] = []
  const clock = world(on, ['- Only on request'], seen)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'work' } as never)
  await finish($ as never, clock, 'done')
  await $.turn.complete({ answer: 'sub', durationMs: 1, isAborted: false, turnId: 's', reason: 'answer', agentId: 'a1' } as never)
  expect(seen.length).toBe(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'update' })
  expect(seen.length).toBe(1)
  expect(seen[0]?.model).toBe('sonnet')
  expect(seen[0]?.prompt).not.toContain('sub')
  await ui.unmount()
})

test('the pane switches the automatic updates off and on; the choice is kept and wins over the setting', async ($, on) => {
  const seen: { model: string; prompt: string }[] = []
  const clock = world(on, ['- Caught up'], seen)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', text: /● auto/ })) != null).toBe(true)
  await ui.press({ key: 'auto' })
  expect(stored.value).toBe(false)
  await ui.unmount()

  // Off: the turn is noted, nothing is sent.
  await $.prompt.submit({ text: 'work while off' } as never)
  await finish($ as never, clock, 'done')
  expect(seen.length).toBe(0)
  const off = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await off.find({ type: 'Button', text: /○ auto off/ })) != null).toBe(true)

  // On again with a turn waiting: it catches up at once.
  await off.press({ key: 'auto' })
  await clock.advance(0)
  expect(stored.value).toBe(true)
  expect(seen.length).toBe(1)
  expect(seen[0]?.prompt).toContain('Asked: work while off')
  await off.unmount()
})

test('a saved "off" holds in a new session even though the setting says auto', async ($, on) => {
  const seen: { model: string; prompt: string }[] = []
  const clock = world(on, ['- x'], seen)
  stored.value = false
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'hello' } as never)
  await finish($ as never, clock, 'done')
  expect(seen.length).toBe(0)
})
