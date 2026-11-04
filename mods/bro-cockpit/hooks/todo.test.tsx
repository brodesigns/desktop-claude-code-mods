import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { hitsIn, isSkipped, parseGrep, parseMarkers, summarize } from './markerscan'
import { append, entriesFrom, findName, parse, plain, remove, restore } from './todomd'

const ROOT = '/p'
const FILE = `# Launch\n- [ ] Write the readme\n  - [ ] Add screenshots\n  note under it\n- [x] Pick a name\n- Plain bullet\n\n## Later\n1. [ ] Ship it\n`
const PANE = {
  plugin: 'bro-cockpit',
  component: 'Pane',
  requestId: 'bro-cockpit',
  props: { title: 'Cockpit', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const ran = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// What the engine saw: the pane being open, every git call, every file read, and a counter that stamps todo.md
// like a file system would (every write moves the modification time).
const seen = { isPaneUp: true, git: [] as string[][], reads: [] as string[], stamp: 1 }

// The engine beneath the cockpit: a project at /p with a todo.md and some changed code, a state kept in a Map.
function world(on: On, files: Record<string, string>, status: string | null, opened: string[][] = [], listing?: { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }[]) {
  const state = new Map<string, unknown>([['cockpitTab', 'todo']])
  seen.isPaneUp = true
  seen.git = []
  seen.reads = []
  seen.stamp = 1
  on('ui.panes', () => ({ value: [{ id: 'bro-cockpit', title: 'Cockpit', isShown: true, isFocused: false, isPlaced: seen.isPaneUp }] }))
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
  on('fs.list', () => ({ value: listing ?? Object.keys(files).map(f => ({ name: f.split('/').pop() as string, kind: 'file' as const, size: files[f]?.length ?? 0, mtimeMs: seen.stamp, isLink: false })) }))
  on('fs.stat', (_, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: { kind: 'file' as const, size: text.length, mtimeMs: 1, isLink: false } }
  })
  on('fs.read', (_, e) => {
    seen.reads.push(e.path)
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', (_, e) => {
    seen.stamp += 1
    files[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'open') {
      opened.push(e.argv)
      return ran(0, '')
    }
    seen.git.push(e.argv)
    if (status === null) return ran(128, '')
    if (e.argv.includes('rev-parse')) return ran(0, '/p\n')
    // `git grep -n -w -e M ...`: every line of every file with one of the words, as `path:line:text`.
    if (e.argv.includes('grep')) {
      const words = e.argv.flatMap((a: string, i: number) => (e.argv[i - 1] === '-e' ? [a] : []))
      const re = new RegExp(`\\b(${words.join('|')})\\b`)
      const rows = Object.entries(files).flatMap(([path, text]) => text.split('\n').flatMap((l, i) => (re.test(l) ? [`${path.replace('/p/', '')}:${i + 1}:${l}`] : [])))
      return rows.length === 0 ? ran(1, '') : ran(0, rows.join('\n') + '\n')
    }
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

test('parse: real-world files, CRLF, tabs, marks, bare boxes, links and emoji', () => {
  const file = '# Plan\r\n- [ ] **Bold** task with [a link](https://x.test) 🚀\r\n\t- [ ] tab indented\r\n- [-] dropped\r\n- [ ]\r\n-\r\n- [~] later\r\n#hashtag is no heading\r\n- [X] big X\r\n'
  const items = parse(file)
  expect(items.map(i => [i.text, i.done, i.depth])).toEqual([
    ['Bold task with a link 🚀', false, 0],
    ['tab indented', false, 2],
    ['dropped', true, 0],
    ['later', true, 0],
    ['big X', true, 0],
  ])
  expect(items.every(i => i.section === 'Plan')).toBe(true)
  // A removal keeps the other lines' CRLF endings and the file ends the same way.
  const cut = remove(file, items[0]!)!
  expect(cut.lines.length).toBe(2)
  expect(cut.text.startsWith('# Plan\r\n- [-] dropped\r\n')).toBe(true)
  expect(cut.text.endsWith('- [X] big X\r\n')).toBe(true)
  expect(restore(cut.text, cut.index, cut.lines)).toBe(file)
})

test('remove: the last line without a newline, the only entry, equal lines, a moved line', () => {
  expect(remove('- [ ] one\n- [ ] two', { index: 1, raw: '- [ ] two' })).toEqual({ text: '- [ ] one', index: 1, lines: ['- [ ] two'] })
  expect(remove('- [ ] only', { index: 0, raw: '- [ ] only' })!.text).toBe('')
  // Equal lines: the one at the given index goes, not the first.
  expect(remove('- [ ] same\n- [ ] same\n', { index: 1, raw: '- [ ] same' })!.text).toBe('- [ ] same\n')
  // The file grew above: the text is found again, the right one goes.
  expect(remove('new\nnew\n- [ ] a\n- [ ] b\n', { index: 1, raw: '- [ ] b' })!.text).toBe('new\nnew\n- [ ] a\n')
  // A sub-entry takes only what is deeper than itself.
  expect(remove('- [ ] a\n  - [ ] b\n    - [ ] c\n  - [ ] d\n', { index: 1, raw: '  - [ ] b' })!.text).toBe('- [ ] a\n  - [ ] d\n')
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

test('a long todo.md draws the first entries and says how many more', async ($, on) => {
  const many = Array.from({ length: 130 }, (_, i) => `- [ ] task ${i + 1}`).join('\n')
  world(on, { '/p/todo.md': many }, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /task 100$/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Text', text: /task 101$/ })) == null).toBe(true)
  expect((await ui.find({ type: 'Text', text: /and 30 more entries in the file/ })) != null).toBe(true)
  await ui.unmount()
})

test('ticking an entry that someone else already removed says so and writes nothing', async ($, on) => {
  const files: Record<string, string> = { '/p/todo.md': '- [ ] a\n- [ ] b\n' }
  world(on, files, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  files['/p/todo.md'] = '- [ ] b\n'
  await ui.press({ key: 'item-0' })
  expect(files['/p/todo.md']).toBe('- [ ] b\n')
  await ui.unmount()
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /no longer in todo.md/ })) != null).toBe(true)
  await after.unmount()
})

test('a symlinked todo.md is found', async ($, on) => {
  const files: Record<string, string> = { '/p/todo.md': '- [ ] linked\n' }
  world(on, files, '', [], [{ name: 'todo.md', kind: 'other', size: 0, mtimeMs: 0, isLink: true }])
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /☐ linked/ })) != null).toBe(true)
  await ui.unmount()
})

test('adding: lines become entries at the end, in the file\'s own line ending; a missing file is created', () => {
  expect(entriesFrom('  - [ ] one\n\n* two\n3. three\nplain')).toEqual(['one', 'two', 'three', 'plain'])
  expect(entriesFrom('   \n  ')).toEqual([])
  expect(append('- [ ] a\n', ['b'])).toBe('- [ ] a\n- [ ] b\n')
  expect(append('- [ ] a', ['b', 'c'])).toBe('- [ ] a\n- [ ] b\n- [ ] c\n')
  expect(append('- [ ] a\r\n', ['b'])).toBe('- [ ] a\r\n- [ ] b\r\n')
  expect(append(null, ['first'])).toBe('# Todo\n\n- [ ] first\n')
  expect(append('', ['first'])).toBe('# Todo\n\n- [ ] first\n')
})

test('the add button writes to todo.md and the entry shows up; without a file it creates one', async ($, on) => {
  const files: Record<string, string> = { '/p/todo.md': '- [ ] a\n' }
  world(on, files, '')
  await begin($ as never, on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'add' })
  await ui.unmount()
  const open = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await open.input({ key: 'todo-add', text: 'second\nthird' })
  expect(files['/p/todo.md']).toBe('- [ ] a\n- [ ] second\n- [ ] third\n')
  await open.unmount()
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /☐ third/ })) != null).toBe(true)
  expect((await after.find({ type: 'Text', text: /Added 2 entries to todo.md/ })) != null).toBe(true)
  await after.unmount()
})

test('without a todo.md the add field creates it', async ($, on) => {
  const files: Record<string, string> = {}
  world(on, files, '', [], [])
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'add' })
  await ui.unmount()
  const open = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await open.input({ key: 'todo-add', text: 'first thing' })
  expect(files['/p/todo.md']).toBe('# Todo\n\n- [ ] first thing\n')
  await open.unmount()
})

test('no todo.md: the tab says so', async ($, on) => {
  world(on, { '/p/README.md': '# x' }, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No todo.md in the project folder/ })) != null).toBe(true)
  await ui.unmount()
})

test('a marker in the middle of any file shows with file, line and text; a click shows the file in the file manager and never opens it', async ($, on) => {
  const opened: string[][] = []
  const files = {
    '/p/a.ts': 'const a = 1\n// some code\n// TODO one\n// FIXME three\n',
    '/p/deep/d.ts': Array.from({ length: 40 }, (_, i) => (i === 29 ? '  // HACK: deep in an untouched file' : `line ${i}`)).join('\n'),
    '/p/c.ts': 'clean\n',
    '/p/todo.md': '- [ ] a task about a TODO\n',
  }
  world(on, files, '', opened)
  await begin($ as never, on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 TODO · 1 FIXME · 1 HACK in 2 files/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /a\.ts:3\s+\/\/ TODO one/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /deep\/d\.ts:30\s+\/\/ HACK: deep in an untouched file/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /c\.ts/ })) == null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /todo\.md/ })) == null).toBe(true)
  await ui.press({ key: 'file-deep/d.ts:30' })
  expect(opened).toEqual([['open', '-R', '/p/deep/d.ts']])
  await ui.unmount()
})

test('a long list shows the first hits and says how many more', async ($, on) => {
  const many = Array.from({ length: 40 }, (_, i) => `// TODO number ${i + 1}`).join('\n')
  world(on, { '/p/many.ts': many }, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', text: /many\.ts:15\b/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /many\.ts:16\b/ })) == null).toBe(true)
  expect((await ui.find({ type: 'Text', text: /and 25 more in the project/ })) != null).toBe(true)
  await ui.unmount()
})

test('no marker anywhere: no "In code" section', async ($, on) => {
  world(on, { '/p/a.ts': 'const todo = 1 // TODOS and TODOx, xFIXME\n' }, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /In code/ })) == null).toBe(true)
  await ui.unmount()
})

test('without git a file Claude writes counts at once', async ($, on) => {
  const files: Record<string, string> = {}
  world(on, files, null)
  const clock = await begin($ as never, on)

  files['/p/new.ts'] = '// XXX later\n'
  await $.tool.call({ tool: 'Write', file_path: 'new.ts', content: files['/p/new.ts'] })
  // The look at the project runs beside the tool result, not before it.
  await clock.advance(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 XXX in 1 file/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /new\.ts:1\s+\/\/ XXX later/ })) != null).toBe(true)
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

test('helpers: whole words, first marker names the hit, binary and generated files, config words', () => {
  const words = ['TODO', 'FIXME']
  expect(hitsIn('a.ts', 'TODO todo TODOS xTODO\nok\n  // FIXME then TODO', words)).toEqual([
    { file: 'a.ts', line: 1, marker: 'TODO', text: 'TODO todo TODOS xTODO' },
    { file: 'a.ts', line: 3, marker: 'FIXME', text: '// FIXME then TODO' },
  ])
  expect(hitsIn('a.bin', 'TODO\u0000', words)).toEqual([])
  expect(parseGrep('src/a.ts:12:  // TODO fix\nnot a hit line\nb.md:3:FIXME: x\n', words)).toEqual([
    { file: 'src/a.ts', line: 12, marker: 'TODO', text: '// TODO fix' },
    { file: 'b.md', line: 3, marker: 'FIXME', text: 'FIXME: x' },
  ])
  expect(isSkipped('pnpm-lock.yaml')).toBe(true)
  expect(isSkipped('logo.png')).toBe(true)
  expect(isSkipped('TODO.md')).toBe(true)
  expect(isSkipped('CHANGELOG.md')).toBe(true)
  expect(isSkipped('docs/notes.txt')).toBe(true)
  expect(isSkipped('src/todo.ts')).toBe(false)
  const sum = summarize([{ file: 'b.ts', line: 2, marker: 'FIXME', text: 'x' }, { file: 'a.ts', line: 9, marker: 'TODO', text: 'y' }, { file: 'a.ts', line: 1, marker: 'TODO', text: 'z' }, { file: 'pnpm-lock.yaml', line: 1, marker: 'TODO', text: 'q' }], words, '/p')
  expect(sum.counts).toEqual([{ marker: 'TODO', n: 2 }, { marker: 'FIXME', n: 1 }])
  expect(sum.hits.map(h => `${h.file}:${h.line}`)).toEqual(['a.ts:1', 'a.ts:9', 'b.ts:2'])
  expect(sum.fileCount).toBe(2)
  expect(parseMarkers('')).toEqual(['TODO', 'FIXME', 'HACK', 'XXX'])
  expect(parseMarkers(' NOTE ,x y,NOTE')).toEqual(['NOTE'])
})

test('git grep runs from the repository root, not from the session folder', async ($, on) => {
  world(on, { '/p/a.ts': '// TODO one\n' }, '')
  await begin($ as never, on)
  const grep = seen.git.find(argv => argv.includes('grep'))
  expect(grep).toBeDefined()
  expect(grep?.slice(grep.indexOf('-C'), grep.indexOf('-C') + 3)).toEqual(['-C', '/p', 'grep'])
})

test('the polls rest while the pane is closed; /cockpit looks once at once', async ($, on) => {
  const files: Record<string, string> = { '/p/a.ts': 'clean\n', '/p/todo.md': '- [ ] one\n' }
  world(on, files, '')
  const clock = await begin($ as never, on)

  seen.isPaneUp = false
  files['/p/a.ts'] = '// TODO later\n'
  files['/p/todo.md'] = '- [ ] one\n- [ ] two\n'
  seen.stamp += 1
  const grepsBefore = seen.git.filter(argv => argv.includes('grep')).length
  await clock.advance(60_000)
  expect(seen.git.filter(argv => argv.includes('grep')).length).toBe(grepsBefore)
  const closed = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await closed.find({ type: 'Text', text: /☐ two/ })) == null).toBe(true)
  await closed.unmount()

  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
  await clock.advance(0)
  const open = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await open.find({ type: 'Text', text: /☐ two/ })) != null).toBe(true)
  expect((await open.find({ type: 'Button', text: /a\.ts:1\s+\/\/ TODO later/ })) != null).toBe(true)
  await open.unmount()

  // Open again: the polls run.
  seen.isPaneUp = true
  files['/p/a.ts'] = '// TODO later\n// FIXME now\n'
  await clock.advance(30_000)
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await again.find({ type: 'Button', text: /a\.ts:2/ })) != null).toBe(true)
  await again.unmount()
})

test('an unchanged todo.md is not read again; a changed one is', async ($, on) => {
  const files: Record<string, string> = { '/p/todo.md': '- [ ] one\n' }
  world(on, files, '')
  const clock = await begin($ as never, on)
  const readsAtStart = seen.reads.filter(p => p === '/p/todo.md').length
  await clock.advance(30_000)
  expect(seen.reads.filter(p => p === '/p/todo.md').length).toBe(readsAtStart)

  files['/p/todo.md'] = '- [ ] one\n- [ ] two\n'
  seen.stamp += 1
  await clock.advance(5_000)
  expect(seen.reads.filter(p => p === '/p/todo.md').length).toBe(readsAtStart + 1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /☐ two/ })) != null).toBe(true)
  await ui.unmount()
})

test('two ticks at the same moment both land in the file', async ($, on) => {
  const files: Record<string, string> = { '/p/todo.md': '- [ ] a\n- [ ] b\n- [ ] c\n' }
  world(on, files, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await Promise.all([ui.press({ key: 'item-0' }), ui.press({ key: 'item-1' })])
  expect(files['/p/todo.md']).toBe('- [ ] c\n')
  await ui.unmount()
})

test('a hit stays on one row: file, line and text in one text', async ($, on) => {
  world(on, { '/p/a.ts': '// TODO ' + 'very long text '.repeat(20) + '\n' }, '')
  await begin($ as never, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await ui.findAll({ type: 'Text', text: /a\.ts:1.*very long/ })
  expect(texts.length).toBeGreaterThan(0)
  await ui.unmount()
})

test('/cockpit with an unknown tab says so and still opens the pane', async ($, on) => {
  world(on, {}, '')
  await begin($ as never, on)
  const run = (args: string) => $.command.run({ command: 'cockpit', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
  expect((await run('foo')).text).toMatch(/Unknown tab "foo"\. Try: home, files, agents, calls, meter, errors, todo, project/)
  expect((await run('todo')).text).toBe('Cockpit pane opened.')
  expect((await run('')).text).toBe('Cockpit pane opened.')
})

test('a symlinked todo.md is shown but never written: tick, add and undo refuse', async ($, on) => {
  const files: Record<string, string> = { '/p/todo.md': '- [ ] linked\n' }
  world(on, files, '', [], [{ name: 'todo.md', kind: 'other', size: 0, mtimeMs: 0, isLink: true }])
  await begin($ as never, on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /☐ linked/ })) != null).toBe(true)
  await ui.press({ key: 'item-0' })
  expect(files['/p/todo.md']).toBe('- [ ] linked\n')
  await ui.press({ key: 'add' })
  await ui.unmount()
  const open = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await open.input({ key: 'todo-add', text: 'new thing' })
  expect(files['/p/todo.md']).toBe('- [ ] linked\n')
  await open.unmount()
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /is a symbolic link/ })) != null).toBe(true)
  await after.unmount()
})

test('plain drops markdown marks and keeps the words', () => {
  expect(plain('**Important:** test the `undo` button')).toBe('Important: test the undo button')
  expect(plain('Task with a [link](https://example.com/a_b_c) and _more_')).toBe('Task with a link and more')
  expect(plain('~~old~~ plan, 2 * 3 = 6 and snake_case_name')).toBe('old plan, 2 * 3 = 6 and snake_case_name')
})

test('parse shows plain text but keeps the raw line for ticking', () => {
  const [item] = parse('- [ ] **Fix** the [bug](https://x.y)')
  expect(item?.text).toBe('Fix the bug')
  expect(item?.raw).toBe('- [ ] **Fix** the [bug](https://x.y)')
})

test('a hit shows plain text', () => {
  expect(hitsIn('a.ts', '// TODO: fix the `total` of the **cart**', ['TODO'])[0]?.text).toBe('// TODO: fix the total of the cart')
})

test('a huge line from a repository is cut before it is processed', () => {
  const started = Date.now()
  const line = '- [ ] ' + ' *a *'.repeat(40_000)
  expect(parse(line)[0]?.text.length).toBeLessThan(700)
  expect(hitsIn('min.js', 'TODO ' + '['.repeat(2000) + 'a('.repeat(50_000), ['TODO'])[0]?.text.length).toBeLessThan(130)
  expect(Date.now() - started).toBeLessThan(2000)
})
