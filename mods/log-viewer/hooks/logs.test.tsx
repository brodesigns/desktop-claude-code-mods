import { expect, mock, test } from 'claude-code/testing'

import { keep, MAX_LINE, MAX_LINES, outcome, tone } from './logs'
import type { LogEntry } from '../types'

// Built from parts so this file does not trip a secret guard itself.
const TOKEN = 'gh' + 'p_' + 'a'.repeat(36)

test('a finished call keeps stdout, then stderr, and exit 0', () => {
  const o = outcome({ result: { stdout: 'built\nwarning: big bundle\n\n', stderr: 'npm WARN old\n', interrupted: false } })
  expect(o.status).toBe('ok')
  expect(o.exitCode).toBe(0)
  expect(o.lines).toEqual([
    { t: 'built', err: false },
    { t: 'warning: big bundle', err: false },
    { t: 'npm WARN old', err: true },
  ])
})

test('an error reads the exit code and the first line as note', () => {
  const o = outcome({ isError: true, result: 'x', text: 'Exit code 2\nError: Cannot find module x\n    at foo' })
  expect(o.status).toBe('error')
  expect(o.exitCode).toBe(2)
  expect(o.note).toBe('Error: Cannot find module x')
  expect(o.lines.length).toBe(2)
})

test('deny, interrupt and background are told apart', () => {
  expect(outcome({ deny: 'secret-guard: blocked' }).status).toBe('denied')
  expect(outcome({ result: { stdout: '', stderr: '', interrupted: true } }).status).toBe('interrupted')
  expect(outcome({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }).status).toBe('background')
  expect(outcome({ isError: true, text: 'Error: something else' }).exitCode).toBe(null)
})

test('output is redacted and capped in lines and length', () => {
  const long = Array.from({ length: MAX_LINES + 30 }, (_, i) => `line ${i}`).join('\n')
  const o = outcome({ result: { stdout: `token=${TOKEN}\n${'x'.repeat(MAX_LINE + 50)}\n${long}`, stderr: '', interrupted: false } })
  expect(o.lines.length).toBe(MAX_LINES)
  expect(o.cut).toBe(32)
  expect(o.lines[o.lines.length - 1]?.t).toBe(`line ${MAX_LINES + 29}`)
  const short = outcome({ result: { stdout: `token=${TOKEN}\n${'x'.repeat(MAX_LINE + 50)}`, stderr: '', interrupted: false } })
  expect(short.lines[0]?.t).toBe('token=[secret removed]')
  expect(short.lines[1]?.t.length).toBe(MAX_LINE)
})

test('old entries drop their output, the list is capped', () => {
  const entry = (i: number): LogEntry => ({ id: `c${i}`, command: `cmd ${i}`, startedAt: i, ms: 1, status: 'ok', exitCode: 0, note: '', lines: [{ t: 'out', err: false }], cut: 0, agent: false })
  let list: LogEntry[] = []
  for (let i = 0; i < 45; i++) list = keep(list, entry(i))
  expect(list.length).toBe(40)
  expect(list[0]?.id).toBe('c5')
  expect(list.filter(x => x.lines.length > 0).length).toBe(10)
  expect(list[0]?.cut).toBe(1)
})

test('error and warning lines are found', () => {
  expect(tone('npm ERR! code ELIFECYCLE')).toBe('error')
  expect(tone('TypeError: x is undefined')).toBe('error')
  expect(tone('warning: package is deprecated')).toBe('warning')
  expect(tone('3 warnings, 1 error')).toBe('error')
  expect(tone('all good')).toBe(undefined)
  // A word inside another word does not count.
  expect(tone('errorless-plugin loaded')).toBe(undefined)
})

const PANE = {
  plugin: 'log-viewer',
  component: 'Pane',
  requestId: 'log-viewer',
  props: { title: 'Logs', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type Answer = { result: unknown; isError?: true; text?: string }

const ANSWERS: Record<string, Answer> = {
  'npm run build': { result: { stdout: 'vite v5 building\nwarning: chunk is large\nbuilt in 2s\n', stderr: '', interrupted: false } },
  'npm test': { isError: true, result: 'Exit code 1\nFAIL src/a.test.ts\nError: expected 1 to be 2', text: 'Exit code 1\nFAIL src/a.test.ts\nError: expected 1 to be 2' },
}

const answerBash = (on: Parameters<typeof mock.clock>[0], clock: ReturnType<typeof mock.clock>) =>
  on('tool.call', async (_, e) => {
    await clock.advance(1500)
    return ANSWERS[(e as { command?: string }).command ?? ''] ?? { result: { stdout: '', stderr: '', interrupted: false } }
  })

test('the pane lists Bash calls, header counts, errors-only toggle, on terminal and desktop', async ($, on) => {
  const clock = mock.clock(on)
  answerBash(on, clock)
  await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: 'Logs' })) != null).toBe(true)
    // Header: entries and failed.
    expect((await ui.find({ type: 'Text', text: '2 · ✗ 1' })) != null).toBe(true)
    const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.text)
    // Oldest first: the newest is the last entry.
    expect(buttons.findIndex(t => /npm run build/.test(t ?? ''))).toBeLessThan(buttons.findIndex(t => /npm test/.test(t ?? '')))
    expect((await ui.find({ type: 'Text', text: 'exit 1' })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: 'exit 0' })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: '1.5s' })) != null).toBe(true)
    // The newest (failed) call is open, its error line highlighted; the older one is closed.
    const err = await ui.find({ type: 'Text', text: 'Error: expected 1 to be 2' })
    expect(err?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: 'built in 2s' })) == null).toBe(true)

    // A click opens the older one, which closes the newest.
    await ui.press({ key: (await ui.find({ type: 'Button', text: /npm run build/ }))?.key ?? 'missing' })
    expect((await ui.find({ type: 'Text', text: 'built in 2s' })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: 'warning: chunk is large' }))?.props.color).toBe('warning')
    expect((await ui.find({ type: 'Text', text: 'Error: expected 1 to be 2' })) == null).toBe(true)

    // Errors only, and back.
    expect((await ui.find({ type: 'Text', text: '✗ errors only' })) != null).toBe(true)
    await ui.press({ key: 'filter' })
    expect((await ui.find({ type: 'Button', text: /npm run build/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Button', text: /npm test/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: 'all' })) != null).toBe(true)
    await ui.press({ key: 'filter' })
    expect((await ui.find({ type: 'Button', text: /npm run build/ })) != null).toBe(true)
    // Back to the start: the newest open again.
    await ui.press({ key: (await ui.find({ type: 'Button', text: /npm test/ }))?.key ?? 'missing' })
    expect((await ui.find({ type: 'Text', text: 'Error: expected 1 to be 2' })) != null).toBe(true)
    await ui.unmount()
  }
})

test('the search field shows from 8 entries on and filters by output', async ($, on) => {
  const clock = mock.clock(on)
  answerBash(on, clock)
  await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: `echo ${i}` })

  const few = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await few.find({ type: 'Input' })) == null).toBe(true)
  await few.unmount()

  await $.tool.call({ tool: 'Bash', command: 'echo last' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Input' })) != null).toBe(true)
    // Matches the output, not only the command.
    await ui.input({ key: 'q', text: 'chunk', kind: 'change' })
    expect((await ui.find({ type: 'Button', text: /npm test/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Button', text: /npm run build/ })) != null).toBe(true)
    await ui.press({ key: 'q-clear' })
    expect((await ui.find({ type: 'Button', text: /npm test/ })) != null).toBe(true)
    await ui.unmount()
  }
})

test('copy output copies the redacted lines; the command goes into the prompt box or onto the clipboard', async ($, on) => {
  const clock = mock.clock(on)
  on('tool.call', async (_, e) => {
    await clock.advance(10)
    return (e as { command?: string }).command === 'npm test' ? ANSWERS['npm test']! : { result: { stdout: `built\nTOKEN=${TOKEN}\n`, stderr: '', interrupted: false } }
  })
  const copied: string[] = []
  const filled: string[] = []
  let boxOpen = true
  on('ui.copy', (_, e) => {
    copied.push((e as { text: string }).text)
    return { value: { isCopied: true as const } }
  })
  on('prompt.fill', (_, e) => {
    if (!boxOpen) return { isFilled: false }
    filled.push((e as { text: string }).text)
    return { isFilled: true }
  })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'make all' })

  for (const surface of ['terminal', 'desktop'] as const) {
    copied.length = 0
    filled.length = 0
    boxOpen = true
    const ui = await $.ui.mount({ ...PANE, surface })
    // The newest (`make all`) is open.
    await ui.press({ key: 'copy-out' })
    expect(copied).toEqual(['built\nTOKEN=[secret removed]'])
    expect(copied.join('')).not.toContain(TOKEN)
    expect((await ui.find({ type: 'Text', text: /Output is on the clipboard/ })) != null).toBe(true)

    await ui.press({ key: 'use-cmd' })
    expect(filled).toEqual(['make all'])
    expect((await ui.find({ type: 'Text', text: /Command is in the prompt box/ })) != null).toBe(true)

    boxOpen = false
    await ui.press({ key: 'use-cmd' })
    expect(copied[copied.length - 1]).toBe('make all')
    expect((await ui.find({ type: 'Text', text: /The command is on the clipboard/ })) != null).toBe(true)
    await ui.unmount()
  }
})

test('a Bash tool that throws still finishes its entry, and the error goes on', async ($, on) => {
  mock.clock(on)
  on('tool.call', () => {
    throw new Error('boom')
  })
  await $.tool.call({ tool: 'Bash', command: 'sleep 9' }).catch(() => undefined)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: '⚙' })) == null).toBe(true)
  expect((await ui.find({ type: 'Text', text: 'Tool failed' })) != null).toBe(true)
  expect((await ui.find({ type: 'Text', text: '1 · ✗ 1' })) != null).toBe(true)
  await ui.unmount()
})

test('an empty pane says so on terminal and desktop, narrow and wide', async ($, on) => {
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const bodyColumns of [30, 90]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect((await ui.find({ type: 'Text', text: /No Bash calls in this session yet/ })) != null).toBe(true)
      await ui.unmount()
    }
  }
})

test('a secret in a command or its output never reaches the state', async ($, on) => {
  mock.clock(on)
  const written: string[] = []
  on('state.set', (_, e, next) => {
    written.push(JSON.stringify(e.value))
    return next(e)
  })
  on('tool.call', () => ({ result: { stdout: `TOKEN=${TOKEN}\n`, stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: `curl -H "Authorization: token ${TOKEN}" https://api.github.com` })

  expect(written.length).toBeGreaterThan(0)
  expect(written.some(w => w.includes(TOKEN))).toBe(false)
  expect(written.some(w => w.includes('[secret removed]'))).toBe(true)
})

test('/logs opens the pane; the scroll button is there and never breaks it', async ($, on) => {
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'logs' } }))
  on('ui.open', (_, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true as const } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: 'x', stderr: '', interrupted: false } }))
  mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const res = await $.command.run({ command: 'logs', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
  expect(res.text).toBe('Logs opened.')
  expect(opened).toEqual(['log-viewer'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // The kit has no window to scroll; the press must still settle without an error.
    await ui.press({ key: 'end' })
    expect((await ui.find({ type: 'Button', text: '↓ to bottom' })) != null).toBe(true)
    await ui.unmount()
  }
})
