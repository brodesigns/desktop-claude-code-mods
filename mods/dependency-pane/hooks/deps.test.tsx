import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { level, parseComposer, parseOutdated, parsePackageJson, parsePyproject, parseRequirements } from './deps'

const PKG = JSON.stringify({
  name: 'demo',
  dependencies: { react: '^18.2.0', next: '14.1.0', 'left-pad': '~1.3.0' },
  devDependencies: { vitest: '^1.0.0', typescript: '^5.3.0' },
  scripts: { test: 'vitest' },
})

const OUTDATED = JSON.stringify({
  react: { current: '18.2.0', wanted: '18.3.1', latest: '19.0.0', dependent: 'demo', location: 'node_modules/react' },
  vitest: { current: '1.0.4', wanted: '1.6.0', latest: '1.6.0', dependent: 'demo' },
  'left-pad': { current: '1.3.0', wanted: '1.3.0', latest: '1.3.1' },
  // Workspaces answer a list per package; not installed has no current.
  next: [{ wanted: '14.1.0', latest: '15.0.3', dependent: 'web' }],
})

test('package.json: groups sorted by name, empty sections left out, broken JSON throws', () => {
  const groups = parsePackageJson(PKG)
  expect(groups.map(g => g.section)).toEqual(['dependencies', 'devDependencies'])
  expect(groups[0]?.deps).toEqual([
    { name: 'left-pad', range: '~1.3.0' },
    { name: 'next', range: '14.1.0' },
    { name: 'react', range: '^18.2.0' },
  ])
  expect(() => parsePackageJson('{ nope')).toThrow()
})

test('requirements.txt: specifiers, extras and markers; comments and options skipped', () => {
  const text = '# tools\n-r base.txt\nDjango>=4.2,<5  # web\nrequests[socks]==2.31.0\nnumpy\nuvicorn ; python_version >= "3.8"\n--index-url https://x\nhttps://example.com/pkg.whl\n'
  expect(parseRequirements(text)[0]?.deps).toEqual([
    { name: 'Django', range: '>=4.2,<5' },
    { name: 'numpy', range: '*' },
    { name: 'requests', range: '==2.31.0' },
    { name: 'uvicorn', range: '*' },
  ])
})

test('pyproject.toml: PEP 621 and poetry tables', () => {
  const text = [
    '[project]',
    'name = "demo"',
    'dependencies = [',
    '  "httpx>=0.27",',
    "  'pydantic[email]~=2.6',",
    ']',
    '[project.optional-dependencies]',
    'dev = ["pytest>=8"]',
    '[tool.poetry.dependencies]',
    'python = "^3.11"',
    'fastapi = "^0.110"',
    'sqlalchemy = { version = "^2.0", extras = ["asyncio"] }',
    '[tool.poetry.group.dev.dependencies]',
    'ruff = "^0.3"',
  ].join('\n')
  const groups = parsePyproject(text)
  expect(groups.map(g => g.section)).toEqual(['project', 'optional dev', 'poetry dependencies', 'poetry dev'])
  expect(groups[0]?.deps).toEqual([{ name: 'httpx', range: '>=0.27' }, { name: 'pydantic', range: '~=2.6' }])
  expect(groups[2]?.deps).toEqual([{ name: 'fastapi', range: '^0.110' }, { name: 'sqlalchemy', range: '^2.0' }])
})

test('composer.json: require and require-dev without the platform', () => {
  const groups = parseComposer(JSON.stringify({ require: { php: '>=8.1', 'ext-json': '*', 'laravel/framework': '^11.0' }, 'require-dev': { 'phpunit/phpunit': '^10' } }))
  expect(groups.map(g => g.deps.map(d => d.name))).toEqual([['laravel/framework'], ['phpunit/phpunit']])
})

test('npm outdated: levels, workspaces, missing current, sorted by severity', () => {
  const parsed = parseOutdated(OUTDATED)
  if ('error' in parsed) throw new Error(parsed.error)
  expect(parsed.items.map(o => `${o.name}:${o.level}`)).toEqual(['next:major', 'react:major', 'vitest:minor', 'left-pad:patch'])
  expect(parsed.items[0]).toEqual({ name: 'next', current: '', wanted: '14.1.0', latest: '15.0.3', level: 'major' })
  expect(level('0.3.1', '0.4.0')).toBe('major')
  expect(level('1.2.3', '1.2.3')).toBe('none')
})

test('npm outdated: empty is all current; an npm error and non-JSON are errors', () => {
  expect(parseOutdated('  \n')).toEqual({ items: [] })
  expect(parseOutdated(JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'request to https://registry.npmjs.org failed' } }))).toEqual({ error: 'request to https://registry.npmjs.org failed' })
  const bad = parseOutdated('npm WARN config something\n{')
  expect('error' in bad && bad.error.startsWith('npm returned no JSON')).toBe(true)
})

const PANE = {
  plugin: 'dependency-pane',
  component: 'Pane',
  requestId: 'dependency-pane',
  props: { title: 'Dependencies', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const COMMAND = { command: 'deps', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }

// A project folder in memory: the files the pane may read. `ref.root` can move to another project.
const project = (on: On, files: Record<string, string>, ref = { root: '/home/dev/demo' }) => {
  on('session.root', () => ({ value: ref.root }))
  on('fs.exists', (_, e) => ({ value: e.path.slice(ref.root.length + 1) in files }))
  on('fs.read', (_, e) => {
    const text = files[e.path.slice(ref.root.length + 1)]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

const ok = (stdout: string, exitCode = 1) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const has = async (ui: { find: (q: never) => Promise<unknown> }, q: unknown) => (await ui.find(q as never)) != null

test('/deps lists the groups folded; npm runs only on the check, then one status line and badges', async ($, on) => {
  mock.clock(on)
  project(on, { 'package.json': PKG, 'requirements.txt': 'flask==3.0.0\n' })
  const runs: string[] = []
  on('process.run', (_, e) => {
    runs.push(e.argv.join(' '))
    return ok(OUTDATED)
  })
  const res = await $.command.run(COMMAND)
  expect(res.text).toBe('Dependencies opened.')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await has(ui, { type: 'Text', text: 'Dependencies' })).toBe(true)
    expect(await has(ui, { type: 'Text', text: '6 packages' })).toBe(true)
    expect(await has(ui, { type: 'Button', text: /▸ package.json · dependencies/ })).toBe(true)
    expect(await has(ui, { type: 'Button', text: /▸ requirements.txt/ })).toBe(true)
    // Folded: no rows in the tree.
    expect(await has(ui, { type: 'Text', text: '^18.2.0' })).toBe(false)
    await ui.unmount()
  }
  expect(runs).toEqual([])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'check' })
    // One status line, no card: major counted, age shown.
    expect(await has(ui, { type: 'Text', text: /4 outdated \(2 major\) · checked just now/ })).toBe(true)
    expect(await has(ui, { type: 'Text', text: /Outdated 4/ })).toBe(false)
    // The group line carries the count of outdated packages.
    expect(await has(ui, { type: 'Text', text: /● 3/ })).toBe(true)
    await ui.unmount()
  }
  expect(runs).toEqual(['npm outdated --json', 'npm outdated --json'])
})

test('a group unfolds and folds again; rows carry the badge and the range', async ($, on) => {
  mock.clock(on)
  project(on, { 'package.json': PKG })
  on('process.run', () => ok(OUTDATED))
  await $.command.run(COMMAND)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'check' })
  expect(await has(ui, { type: 'Text', text: 'vitest' })).toBe(false)
  await ui.press({ key: 'h-package.json:devDependencies' })
  expect(await has(ui, { type: 'Text', text: 'vitest' })).toBe(true)
  expect(await has(ui, { type: 'Text', text: '^1.0.0' })).toBe(true)
  expect((await ui.find({ type: 'Text', text: '● 1.6.0' }))?.props.color).toBe('warning')
  await ui.press({ key: 'h-package.json:devDependencies' })
  expect(await has(ui, { type: 'Text', text: 'vitest' })).toBe(false)
  await ui.press({ key: 'h-package.json:dependencies' })
  expect((await ui.find({ type: 'Text', text: '✗ 19.0.0' }))?.props.color).toBe('error')
  await ui.unmount()
})

test('the copy action puts "npm i <name>@latest" on the clipboard and never runs npm install', async ($, on) => {
  mock.clock(on)
  project(on, { 'package.json': PKG })
  const runs: string[] = []
  on('process.run', (_, e) => {
    runs.push(e.argv.join(' '))
    return ok(OUTDATED)
  })
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  await $.command.run(COMMAND)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'check' })
  await ui.press({ key: 'h-package.json:dependencies' })
  // Only outdated rows have the action.
  expect(await has(ui, { type: 'Button', key: 'cp-package.json:dependencies-react' })).toBe(true)
  await ui.press({ key: 'cp-package.json:dependencies-react' })
  expect(copied).toEqual(['npm i react@latest'])
  expect(await has(ui, { type: 'Text', text: /Copied: npm i react@latest/ })).toBe(true)
  expect(runs).toEqual(['npm outdated --json'])
  await ui.unmount()
})

test('a root change drops the old check result', async ($, on) => {
  mock.clock(on)
  const ref = { root: '/home/dev/demo' }
  project(on, { 'package.json': PKG }, ref)
  on('process.run', () => ok(OUTDATED))
  await $.command.run(COMMAND)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'check' })
  expect(await has(ui, { type: 'Text', text: /4 outdated/ })).toBe(true)
  await ui.unmount()

  // /cd into another project with the same package names.
  ref.root = '/home/dev/other'
  await $.command.run(COMMAND)
  const other = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(other, { type: 'Text', text: /outdated/ })).toBe(false)
  expect(await has(other, { type: 'Button', key: 'check' })).toBe(true)
  await other.press({ key: 'h-package.json:dependencies' })
  expect(await has(other, { type: 'Text', text: /● 1\.3\.1|✗ 19/ })).toBe(false)
  await other.unmount()
})

test('the project is loaded at session start; a failing load does not break the start', async ($, on) => {
  project(on, { 'package.json': PKG })
  await $.session.start({ cwd: '/home/dev/demo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, { type: 'Text', text: '5 packages' })).toBe(true)
  await ui.unmount()
})

test('a failing load at session start leaves the "not loaded" state with a reload button', async ($, on) => {
  on('session.root', () => {
    throw new Error('no root')
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/home/dev/demo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await has(ui, { type: 'Text', text: /Not loaded yet/ })).toBe(true)
  expect(await has(ui, { type: 'Button', key: 'reload' })).toBe(true)
  await ui.unmount()
})

test('without npm, or on a timeout, the pane shows the error and stays usable', async ($, on) => {
  mock.clock(on)
  project(on, { 'package.json': PKG })
  on('process.run', () => {
    throw new Error('spawn npm ENOENT')
  })
  await $.command.run(COMMAND)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'check' })
    expect(await has(ui, { type: 'Text', text: /npm not found/ })).toBe(true)
    expect(await has(ui, { type: 'Button', key: 'check' })).toBe(true)
    await ui.unmount()
  }
})

test('non-JSON from npm is an error, not a crash', async ($, on) => {
  mock.clock(on)
  project(on, { 'package.json': PKG })
  on('process.run', () => ok('<html>proxy error</html>'))
  await $.command.run(COMMAND)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'check' })
  expect(await has(ui, { type: 'Text', text: /npm returned no JSON/ })).toBe(true)
  await ui.unmount()
})

test('no manifest: an empty state and no check action, narrow and wide', async ($, on) => {
  project(on, {})
  await $.command.run(COMMAND)
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const bodyColumns of [30, 90]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect(await has(ui, { type: 'Text', text: /No package.json/ })).toBe(true)
      expect(await has(ui, { type: 'Button', key: 'check' })).toBe(false)
      await ui.unmount()
    }
  }
})

test('a broken package.json is named, the other files still show', async ($, on) => {
  project(on, { 'package.json': '{ "dependencies": ', 'composer.json': JSON.stringify({ require: { 'monolog/monolog': '^3.0' } }) })
  await $.command.run(COMMAND)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, { type: 'Text', text: /package.json: / })).toBe(true)
  await ui.press({ key: 'h-composer.json:require' })
  expect(await has(ui, { type: 'Text', text: 'monolog/monolog' })).toBe(true)
  await ui.unmount()
})

test('before anything is loaded the pane says so and reload fills it', async ($, on) => {
  project(on, { 'package.json': PKG })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, { type: 'Text', text: /Not loaded yet/ })).toBe(true)
  await ui.press({ key: 'reload' })
  expect(await has(ui, { type: 'Text', text: '5 packages' })).toBe(true)
  await ui.unmount()
})
