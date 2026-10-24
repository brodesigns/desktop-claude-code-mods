import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { isProtected, parsePatterns } from './match'

const BAND = {
  plugin: 'branch-guard-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const SURFACES = ['terminal', 'desktop'] as const

const ran = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// `head.branch` is what `git symbolic-ref` answers: a name, null for "not a repository", 'missing' for no git binary.
const world = (on: On, head: { branch: string | null | 'missing' }) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => (head.branch === 'missing' ? { deny: 'ENOENT git' } : head.branch === null ? ran(128, '') : ran(0, `${head.branch}\n`)))
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return mock.clock(on)
}

// The first look runs unawaited after the start; advancing the mocked clock lets it settle.
async function begin($: Engine, clock: { advance: (ms: number) => Promise<void> }) {
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await clock.advance(0)
}

test('on main the band warns, on terminal and desktop', async ($, on) => {
  const clock = world(on, { branch: 'main' })
  await begin($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const warning = await ui.find({ type: 'Text', text: /⚠/ })
    expect(warning?.text).toBe('⚠ You are working directly on main')
    expect(warning?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: /git switch -c/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
})

for (const branch of ['feature/login', null, 'missing'] as const) {
  test(`hidden for ${branch === null ? 'no repository' : branch === 'missing' ? 'no git' : branch}`, async ($, on) => {
    const clock = world(on, { branch })
    await begin($, clock)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect((await ui.find({ type: 'Text', text: /⚠/ })) == null).toBe(true)
      expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
      await ui.unmount()
    }
  })
}

test('a survey takes the band', async ($, on) => {
  const clock = world(on, { branch: 'master' })
  await begin($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface })
    expect((await ui.find({ type: 'Text', text: /⚠/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('a git switch by Claude shows at once, the poll catches a switch outside', async ($, on) => {
  const head: { branch: string | null } = { branch: 'feature/x' }
  const clock = world(on, head)
  await begin($, clock)

  head.branch = 'main'
  await $.tool.call({ tool: 'Bash', command: 'git switch main' })
  const shown = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await shown.find({ type: 'Text', text: /⚠/ }))?.text).toBe('⚠ You are working directly on main')
  await shown.unmount()

  head.branch = 'feature/y'
  await clock.advance(15_000)
  const hidden = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await hidden.find({ type: 'Text', text: /⚠/ })) == null).toBe(true)
  await hidden.unmount()
})

test('own list with a wildcard, hint off', { options: { branches: 'develop, release/*', hint: false } }, async ($, on) => {
  const clock = world(on, { branch: 'release/1.2' })
  await begin($, clock)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /⚠/ }))?.text).toBe('⚠ You are working directly on release/1.2')
  expect((await ui.find({ type: 'Text', text: /git switch -c/ })) == null).toBe(true)
  await ui.unmount()
})

test('patterns match whole names only', () => {
  const p = parsePatterns('main, release/*, v1.0')
  expect(isProtected('main', p)).toBe(true)
  expect(isProtected('maintenance', p)).toBe(false)
  expect(isProtected('release/2', p)).toBe(true)
  expect(isProtected('v1x0', p)).toBe(false)
  expect(isProtected('master', parsePatterns(' , '))).toBe(true)
})
