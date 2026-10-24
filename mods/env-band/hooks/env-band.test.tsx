import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { byPrecedence, envName, toneOf } from './envfile'

const BAND = {
  plugin: 'env-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// The project root /p holds `files` (by name) beside a source folder and a direnv file.
const world = (on: On, files: Record<string, string>) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/p' }))
  on('fs.list', () => ({
    value: [
      ...Object.keys(files).map(name => ({ name, kind: 'file' as const, size: files[name]?.length ?? 0, mtimeMs: 1, isLink: false })),
      { name: 'src', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false },
      { name: '.envrc', kind: 'file' as const, size: 3, mtimeMs: 1, isLink: false },
    ],
  }))
  const at = (path: string) => files[path.replace(/^\/p\//, '')]
  on('fs.stat', (_, e) => {
    const text = at(e.path)
    return text === undefined ? { deny: 'ENOENT' } : { value: { kind: 'file' as const, size: text.length, mtimeMs: 1, isLink: false } }
  })
  on('fs.read', (_, e) => {
    const text = at(e.path)
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
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

const SECRET = 'hidden' + '123'

test('the environment name and the files, never another value, on terminal and desktop', async ($, on) => {
  const clock = world(on, {
    '.env': `NODE_ENV=production\nSECRET_VALUE=${SECRET}\n`,
    '.env.local': `# local\nexport NODE_ENV="development" # mine\nSECRET_VALUE=${SECRET}\n`,
    '.env.example': 'NODE_ENV=staging\n',
  })
  await begin($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const title = await ui.find({ type: 'Text', text: /◉/ })
    expect(title?.text).toBe('◉ development')
    expect(title?.props.color).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^ ·/ }))?.text).toBe(' · .env.local, .env')
    expect((await ui.find({ type: 'Text', text: new RegExp(SECRET) })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
})

test('no .env file: the band stays hidden', async ($, on) => {
  const clock = world(on, { 'package.json': '{}' })
  await begin($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /◉/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
})

test('a survey takes the band', async ($, on) => {
  const clock = world(on, { '.env': 'NODE_ENV=development' })
  await begin($, clock)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface })
    expect((await ui.find({ type: 'Text', text: /◉/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('files without a name, and an interpolation, say so', async ($, on) => {
  const clock = world(on, { '.env': 'NODE_ENV=${MODE}\nPORT=3000\n' })
  await begin($, clock)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /◉/ }))?.text).toBe('◉ Environment not set')
  await ui.unmount()
})

test('a .env file Claude writes shows at once', async ($, on) => {
  const files: Record<string, string> = {}
  const clock = world(on, files)
  await begin($, clock)

  files['.env.production'] = 'APP_ENV=production\n'
  await $.tool.call({ tool: 'Write', file_path: '/p/.env.production', content: files['.env.production'] })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const title = await ui.find({ type: 'Text', text: /◉/ })
    expect(title?.text).toBe('◉ production')
    expect(title?.props.color).toBe('error')
    await ui.unmount()
  }
})

test('templates count when the setting says so, own variable list', { options: { ignoreTemplates: false, variables: 'STAGE' } }, async ($, on) => {
  const clock = world(on, { '.env.example': 'NODE_ENV=development\nSTAGE=staging\n' })
  await begin($, clock)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const title = await ui.find({ type: 'Text', text: /◉/ })
  expect(title?.text).toBe('◉ staging')
  expect(title?.props.color).toBe('warning')
  await ui.unmount()
})

test('helpers: precedence, parsing, tones', () => {
  expect(byPrecedence(['.env.production', '.env', '.env.example', '.env.development.local', '.env.local'])).toEqual([
    '.env.local',
    '.env',
    '.env.development.local',
    '.env.production',
    '.env.example',
  ])
  expect(envName("APP_ENV='staging'\nNODE_ENV=test", ['NODE_ENV', 'APP_ENV'])).toBe('test')
  expect(envName('NODE_ENV=https://x.y/z?k=v', ['NODE_ENV'])).toBe('')
  expect(toneOf('production')).toBe('error')
  expect(toneOf('prod-eu')).toBe('error')
  expect(toneOf('Staging')).toBe('warning')
  expect(toneOf('productive')).toBe('info')
  expect(toneOf('development')).toBe('info')
})
