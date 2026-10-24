import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { changedPaths, countMarkers, parseMarkers } from './scan'

const BAND = {
  plugin: 'todo-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const SURFACES = ['terminal', 'desktop'] as const

const ran = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

// A project at /p: `status` is git's porcelain -z output, null for "no repository". Files are served by path.
const world = (on: On, files: Record<string, string>, status: string | null) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/p' }))
  on('process.run', (_, e) => {
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
  // The engine's own band beneath: a band that shows wraps it, one that hides leaves it alone.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

async function begin($: Engine, on: On) {
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await clock.advance(0)

  return clock
}

test('changed files with markers show one line with counts, on terminal and desktop', async ($, on) => {
  world(on, { '/p/a.ts': '// TODO one\n// TODO two\n// FIXME three\n', '/p/b.md': 'TODO\n', '/p/c.ts': 'clean\n' }, ' M a.ts\u0000?? b.md\u0000?? c.ts\u0000 D gone.ts\u0000')
  await begin($, on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /☐/ }))?.text).toBe('☐ 3 TODO · 1 FIXME in 2 files')
    expect((await ui.find({ type: 'Text', text: /a\.ts, b\.md/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
})

test('no marker in any changed file: the band stays hidden', async ($, on) => {
  world(on, { '/p/a.ts': 'const todo = 1 // TODOS and TODOx, xFIXME\n' }, ' M a.ts\u0000')
  await begin($, on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /☐/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('a clean tree hides the band and leaves the engine drawing', async ($, on) => {
  world(on, {}, '')
  await begin($, on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /☐/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /engine/ })) != null).toBe(true)
    await ui.unmount()
  }
})

test('a survey takes the band', async ($, on) => {
  world(on, { '/p/a.ts': 'TODO' }, ' M a.ts\u0000')
  await begin($, on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface })
    expect((await ui.find({ type: 'Text', text: /☐/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('a file Claude writes counts at once, also outside git', async ($, on) => {
  const files: Record<string, string> = {}
  world(on, files, null)
  await begin($, on)

  files['/p/new.ts'] = '// XXX later\n'
  await $.tool.call({ tool: 'Write', file_path: 'new.ts', content: files['/p/new.ts'] })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /☐/ }))?.text).toBe('☐ 1 XXX in 1 file')
    await ui.unmount()
  }
})

test('the poll picks up a new marker after 20 seconds', async ($, on) => {
  const files: Record<string, string> = { '/p/a.ts': 'clean' }
  world(on, files, ' M a.ts\u0000')
  const clock = await begin($, on)

  files['/p/a.ts'] = '// HACK quick fix'
  await clock.advance(20_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /☐/ }))?.text).toBe('☐ 1 HACK in 1 file')
  await ui.unmount()
})

test('custom markers from the settings', { options: { markers: 'NOTE, broken!, TODO' } }, async ($, on) => {
  world(on, { '/p/a.ts': 'NOTE x\nTODO y\nFIXME z' }, ' M a.ts\u0000')
  await begin($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /☐/ }))?.text).toBe('☐ 1 NOTE · 1 TODO in 1 file')
  await ui.unmount()
})

test('helpers: whole words, renames, config words', () => {
  expect(countMarkers('TODO todo TODOS xTODO TODO: (TODO)', ['TODO'])).toEqual([3])
  expect(countMarkers('TODO\u0000', ['TODO'])).toEqual([0])
  expect(changedPaths('R  new.ts\u0000old.ts\u0000 M b.ts\u0000D  gone.ts\u0000')).toEqual(['new.ts', 'b.ts'])
  expect(parseMarkers('')).toEqual(['TODO', 'FIXME', 'HACK', 'XXX'])
  expect(parseMarkers(' NOTE ,x y,NOTE')).toEqual(['NOTE'])
})
