import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { changedPaths, countMarkers, parseMarkers } from './scan'
import { findName, parse, remove, restore } from './todo'

const ROOT = '/home/x/demo'
const FILE = `# Launch\n- [ ] Write the readme\n  - [ ] Add screenshots\n  note under it\n- [x] Pick a name\n- Plain bullet\n\n## Later\n1. [ ] Ship it\n`
const COMPOSER = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
const PANE = {
  plugin: 'todo-md-pane',
  component: 'Pane',
  requestId: 'todo-md-pane',
  props: { title: 'Todo', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type OnLike = Parameters<typeof import('claude-code/testing').mock.store>[0]

// The engine beneath the plugin: a root, a folder with a todo.md, a file that can be written.
function world(on: OnLike, files: Record<string, string>) {
  on('session.root', () => ({ value: ROOT }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.list', () => ({ value: Object.keys(files).map(f => ({ name: f.split('/').pop() as string, kind: 'file', size: 1, mtimeMs: 1, isLink: false })) }))
  on('fs.read', (_, e) => ({ value: files[e.path] as string }))
  on('fs.write', (_, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
}

test('parse: entries with and without boxes, sections, depth, done flag; code fences are skipped', () => {
  const items = parse(FILE)
  expect(items.map(i => [i.text, i.section, i.depth, i.done])).toEqual([
    ['Write the readme', 'Launch', 0, false],
    ['Add screenshots', 'Launch', 1, false],
    ['Pick a name', 'Launch', 0, true],
    ['Plain bullet', 'Launch', 0, false],
    ['Ship it', 'Later', 0, false],
  ])
  expect(parse('```\n- [ ] in code\n```\n- [ ] real').map(i => i.text)).toEqual(['real'])
  expect(parse('- [ ] crlf\r\n- [ ] two\r\n').map(i => i.text)).toEqual(['crlf', 'two'])
  expect(findName(['a.md', 'TODO.md'])).toBe('TODO.md')
  expect(findName(['todo.txt'])).toBeNull()
})

test('remove cuts the entry with its sub-lines; a changed file never loses another line', () => {
  const first = parse(FILE)[0]!
  const cut = remove(FILE, first)!
  expect(cut.lines).toEqual(['- [ ] Write the readme', '  - [ ] Add screenshots', '  note under it'])
  expect(cut.text).not.toContain('readme')
  expect(cut.text).toContain('- [x] Pick a name')
  // the line moved up by one: found by its text
  const moved = remove('new line\n' + FILE, first)!
  expect(moved.index).toBe(2)
  // gone: nothing removed
  expect(remove('- [ ] other', first)).toBeNull()
  expect(restore(cut.text, cut.index, cut.lines)).toBe(FILE)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane on ${surface}: shows open entries, ticking removes the line, undo brings it back`, async ($, on) => {
    const files: Record<string, string> = { [`${ROOT}/todo.md`]: FILE }
    world(on, files)
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })

    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /todo.md · 4 open/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /☐ Write the readme/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /Pick a name/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /Later/ })) != null).toBe(true)

    await ui.press({ key: 'item-1' })
    expect(files[`${ROOT}/todo.md`]).not.toContain('Write the readme')
    expect(files[`${ROOT}/todo.md`]).not.toContain('Add screenshots')
    expect(files[`${ROOT}/todo.md`]).toContain('Plain bullet')
    expect((await ui.find({ type: 'Text', text: /removed from todo.md/ })) != null).toBe(true)

    await ui.press({ key: 'undo' })
    expect(files[`${ROOT}/todo.md`]).toBe(FILE)
    await ui.unmount()
  })
}

test('no todo.md: the pane says so and /todolist still opens it', async ($, on) => {
  const files: Record<string, string> = { [`${ROOT}/README.md`]: '# x' }
  world(on, files)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const res = await $.command.run({ command: 'todolist', args: '', ...COMPOSER } as never)
  expect(res.text).toBe('Todo pane opened.')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No todo.md in the project folder/ })) != null).toBe(true)
  await ui.unmount()
})

// --- code markers (TODO, FIXME ...) in changed files ---

const ran = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// A project at /p: `status` is git's porcelain -z output, null for "no repository". Files are served by path.
const codeWorld = (on: On, files: Record<string, string>, status: string | null, opened: string[][] = []) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/p' }))
  on('session.root', () => ({ value: '/p' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'open') {
      opened.push(e.argv)
      return ran(0, '')
    }
    if (status === null) return ran(128, '')
    return e.argv.includes('rev-parse') ? ran(0, '/p\n') : ran(0, status)
  })
  on('fs.stat', (_, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: { kind: 'file' as const, size: text.length, mtimeMs: 1, isLink: false } }
  })
  on('fs.read', (_, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('tool.call', () => ({ result: {} }))
}

async function begin($: { session: { start: (a: never) => Promise<unknown> } }, on: On) {
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true } as never)
  await clock.advance(0)

  return clock
}

test('changed files with markers: counts per marker, each file opens on a click', async ($, on) => {
  const opened: string[][] = []
  codeWorld(on, { '/p/a.ts': '// TODO one\n// TODO two\n// FIXME three\n', '/p/b.md': 'TODO\n', '/p/c.ts': 'clean\n' }, ' M a.ts\u0000?? b.md\u0000?? c.ts\u0000 D gone.ts\u0000', opened)
  await begin($ as never, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /3 TODO · 1 FIXME in 2 files/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Button', text: /a\.ts/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Button', text: /c\.ts/ })) == null).toBe(true)
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'file-a.ts' })
  expect(opened).toEqual([['open', '/p/a.ts']])
  await ui.unmount()
})

test('no marker, or a clean tree: no "In code" section', async ($, on) => {
  codeWorld(on, { '/p/a.ts': 'const todo = 1 // TODOS and TODOx, xFIXME\n' }, ' M a.ts\u0000')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /In code/ })) == null).toBe(true)
  await ui.unmount()
})

test('a file Claude writes counts at once, also outside git', async ($, on) => {
  const files: Record<string, string> = {}
  codeWorld(on, files, null)
  await begin($ as never, on)

  files['/p/new.ts'] = '// XXX later\n'
  await $.tool.call({ tool: 'Write', file_path: 'new.ts', content: files['/p/new.ts'] })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 XXX in 1 file/ })) != null).toBe(true)
  await ui.unmount()
})

test('the poll picks up a new marker after 20 seconds', async ($, on) => {
  const files: Record<string, string> = { '/p/a.ts': 'clean' }
  codeWorld(on, files, ' M a.ts\u0000')
  const clock = await begin($ as never, on)

  files['/p/a.ts'] = '// HACK quick fix'
  await clock.advance(20_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 HACK in 1 file/ })) != null).toBe(true)
  await ui.unmount()
})

test('custom markers from the settings', { options: { markers: 'NOTE, broken!, TODO' } }, async ($, on) => {
  codeWorld(on, { '/p/a.ts': 'NOTE x\nTODO y\nFIXME z' }, ' M a.ts\u0000')
  await begin($ as never, on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /1 NOTE · 1 TODO in 1 file/ })) != null).toBe(true)
  await ui.unmount()
})

test('helpers: whole words, renames, config words', () => {
  expect(countMarkers('TODO todo TODOS xTODO TODO: (TODO)', ['TODO'])).toEqual([3])
  expect(countMarkers('TODO\u0000', ['TODO'])).toEqual([0])
  expect(changedPaths('R  new.ts\u0000old.ts\u0000 M b.ts\u0000D  gone.ts\u0000')).toEqual(['new.ts', 'b.ts'])
  expect(parseMarkers('')).toEqual(['TODO', 'FIXME', 'HACK', 'XXX'])
  expect(parseMarkers(' NOTE ,x y,NOTE')).toEqual(['NOTE'])
})
