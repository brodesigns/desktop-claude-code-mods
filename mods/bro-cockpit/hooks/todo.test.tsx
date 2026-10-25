import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { changedPaths, countMarkers, parseMarkers } from './markerscan'
import { findName, parse, remove, restore } from './todomd'

const ROOT = '/p'
const FILE = `# Launch\n- [ ] Write the readme\n  - [ ] Add screenshots\n  note under it\n- [x] Pick a name\n- Plain bullet\n\n## Later\n1. [ ] Ship it\n`
const PANE = {
  plugin: 'bro-cockpit',
  component: 'Pane',
  requestId: 'bro-cockpit',
  props: { title: 'Cockpit', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const ran = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// The engine beneath the cockpit: a project at /p with a todo.md and some changed code, a state kept in a Map.
function world(on: On, files: Record<string, string>, status: string | null, opened: string[][] = []) {
  const state = new Map<string, unknown>([['cockpitTab', 'todo']])
  on('state.get', (_, e) => ({ value: { value: state.get((e as { key: string }).key), version: 1 } }))
  on('state.set', (_, e) => {
    state.set((e as { key: string }).key, (e as unknown as { value: unknown }).value)
    return { value: { isSet: true as const, version: 2 } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.list', () => ({ value: Object.keys(files).filter(f => !f.slice(1).includes('/') === false || true).map(f => ({ name: f.split('/').pop() as string, kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false })) }))
  on('fs.stat', (_, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: { kind: 'file' as const, size: text.length, mtimeMs: 1, isLink: false } }
  })
  on('fs.read', (_, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', (_, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'open') {
      opened.push(e.argv)
      return ran(0, '')
    }
    if (status === null) return ran(128, '')
    if (e.argv.includes('rev-parse')) return ran(0, '/p\n')
    if (e.argv.includes('remote')) return ran(1, '')
    // The cockpit's own git line asks `status --porcelain -b`; the marker scan asks `status --porcelain=v1 -z`.
    return e.argv.includes('-b') ? ran(0, '## main\n') : ran(0, status)
  })
  on('tool.call', () => ({ result: {} }))
}

async function begin($: { session: { start: (a: never) => Promise<unknown> } }, on: On) {
  const clock = mock.clock(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true } as never)
  await clock.advance(0)

  return clock
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
  test(`the todo tab on ${surface}: open entries, ticking removes the line, undo brings it back`, async ($, on) => {
    const files: Record<string, string> = { '/p/todo.md': FILE }
    world(on, files, '')
    await begin($ as never, on)

    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /☐ Write the readme/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /Pick a name/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^Later$/ })) != null).toBe(true)

    await ui.press({ key: 'item-1' })
    expect(files['/p/todo.md']).not.toContain('Write the readme')
    expect(files['/p/todo.md']).not.toContain('Add screenshots')
    expect(files['/p/todo.md']).toContain('Plain bullet')
    // The state here is a plain Map, so the tab is drawn again by mounting it again.
    await ui.unmount()
    const after = await $.ui.mount({ ...PANE, surface })
    expect((await after.find({ type: 'Text', text: /removed from todo.md/ })) != null).toBe(true)
    expect((await after.find({ type: 'Text', text: /☐ Write the readme/ })) == null).toBe(true)

    await after.press({ key: 'undo' })
    expect(files['/p/todo.md']).toBe(FILE)
    await after.unmount()
  })
}

test('no todo.md: the tab says so', async ($, on) => {
  world(on, { '/p/README.md': '# x' }, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No todo.md in the project folder/ })) != null).toBe(true)
  await ui.unmount()
})

test('changed files with markers: counts per marker, each file opens on a click', async ($, on) => {
  const opened: string[][] = []
  world(on, { '/p/a.ts': '// TODO one\n// TODO two\n// FIXME three\n', '/p/b.md': 'TODO\n', '/p/c.ts': 'clean\n' }, ' M a.ts\u0000?? b.md\u0000?? c.ts\u0000 D gone.ts\u0000', opened)
  await begin($ as never, on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /3 TODO · 1 FIXME in 2 files/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /c\.ts/ })) == null).toBe(true)
  await ui.press({ key: 'file-a.ts' })
  expect(opened).toEqual([['open', '/p/a.ts']])
  await ui.unmount()
})

test('a file Claude writes counts at once, also outside git', async ($, on) => {
  const files: Record<string, string> = {}
  world(on, files, null)
  await begin($ as never, on)

  files['/p/new.ts'] = '// XXX later\n'
  await $.tool.call({ tool: 'Write', file_path: 'new.ts', content: files['/p/new.ts'] })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 XXX in 1 file/ })) != null).toBe(true)
  await ui.unmount()
})

test('the poll picks up a new marker after 30 seconds; custom markers come from the settings', { options: { markers: 'NOTE, broken!, HACK' } }, async ($, on) => {
  const files: Record<string, string> = { '/p/a.ts': 'clean' }
  world(on, files, ' M a.ts\u0000')
  const clock = await begin($ as never, on)

  files['/p/a.ts'] = '// HACK quick fix\nNOTE x\nTODO y'
  await clock.advance(30_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 NOTE · 1 HACK in 1 file/ })) != null).toBe(true)
  await ui.unmount()
})

test('helpers: whole words, renames, config words', () => {
  expect(countMarkers('TODO todo TODOS xTODO TODO: (TODO)', ['TODO'])).toEqual([3])
  expect(countMarkers('TODO\u0000', ['TODO'])).toEqual([0])
  expect(changedPaths('R  new.ts\u0000old.ts\u0000 M b.ts\u0000D  gone.ts\u0000')).toEqual(['new.ts', 'b.ts'])
  expect(parseMarkers('')).toEqual(['TODO', 'FIXME', 'HACK', 'XXX'])
  expect(parseMarkers(' NOTE ,x y,NOTE')).toEqual(['NOTE'])
})
