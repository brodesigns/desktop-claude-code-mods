import { expect, mock, test } from 'claude-code/testing'

import { label, parseLsof, parseSs, select, wanted } from './ports'

const LSOF = [
  'COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
  'node      41022 dev    23u  IPv6 0x1a2b3c4d5e6f7a8b      0t0  TCP *:3000 (LISTEN)',
  'node      41022 dev    24u  IPv4 0x1a2b3c4d5e6f7a8c      0t0  TCP 127.0.0.1:3000 (LISTEN)',
  'node      41100 dev    31u  IPv6 0x1a2b3c4d5e6f7a8d      0t0  TCP [::1]:5173 (LISTEN)',
  'Python    41200 dev     4u  IPv4 0x1a2b3c4d5e6f7a8e      0t0  TCP 127.0.0.1:8000 (LISTEN)',
  'My\\x20App  41300 dev     9u  IPv4 0x1a2b3c4d5e6f7a8f      0t0  TCP *:9123 (LISTEN)',
  'rapportd    512 dev     4u  IPv4 0x1a2b3c4d5e6f7a90      0t0  TCP *:49152 (LISTEN)',
  'sshd         90 root    3u  IPv4 0x1a2b3c4d5e6f7a91      0t0  TCP *:22 (LISTEN)',
].join('\n')

const SS = [
  'State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process',
  'LISTEN 0      511          0.0.0.0:3000       0.0.0.0:*     users:(("node",pid=1234,fd=20))',
  'LISTEN 0      511             [::]:3000          [::]:*     users:(("node",pid=1234,fd=21))',
  'LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*',
  'LISTEN 0      511            [::1]:5173          [::]:*     users:(("node",pid=99,fd=3))',
  'LISTEN 0      128          0.0.0.0:8080       0.0.0.0:*',
].join('\n')

test('lsof output is parsed, IPv4 and IPv6 fold, escaped names read', () => {
  const list = parseLsof(LSOF)
  expect(list.length).toBe(7)
  expect(list[0]).toEqual({ port: 3000, name: 'node', pid: 41022 })
  expect(list[4]?.name).toBe('My App')
  const shown = select(list, wanted('3000,5173,8000'))
  expect(shown.map(l => l.port)).toEqual([3000, 5173, 8000])
  expect(shown.map(label)).toEqual(['node', 'vite', 'Python'])
})

test('ss output is parsed; a listener of another user has no name', () => {
  const list = parseSs(SS)
  expect(list.map(l => l.port)).toEqual([3000, 3000, 53, 5173, 8080])
  expect(list[3]).toEqual({ port: 5173, name: 'node', pid: 99 })
  expect(list[4]?.name).toBe('')
  // The default list holds 8080, so a foreign listener there still shows, without a name.
  expect(select(list, wanted('')).map(l => `${l.port}${l.name}`)).toEqual(['3000node', '5173node', '8080'])
})

test('"all" keeps own ports from 1024 up; a broken setting falls back to the default list', () => {
  expect(select(parseLsof(LSOF), wanted('*')).map(l => l.port)).toEqual([3000, 5173, 8000, 9123, 49152])
  expect(select(parseSs(SS), wanted('all')).map(l => l.port)).toEqual([3000, 5173])
  expect(wanted('abc')).toEqual({ all: false, ports: [3000, 3001, 4200, 5000, 5173, 8000, 8080, 8888] })
  expect(wanted(' 3000 ; 70000, 8080 ')).toEqual({ all: false, ports: [3000, 8080] })
})

test('garbage and empty output give no listeners', () => {
  expect(parseLsof('')).toEqual([])
  expect(parseSs('Error: something\nnot a table')).toEqual([])
})

const BAND = {
  plugin: 'port-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

const SESSION = { cwd: '/', surface: 'desktop', isInteractive: true } as const

test('the band shows the listening dev servers on terminal and desktop, above another band', async ($, on) => {
  const clock = mock.clock(on)
  // Stands for what draws beneath the plugin: here another mod's band.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other line</Text>
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ok(LSOF))
  await $.session.start(SESSION)
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    for (const t of [/:3000 node/, /:5173 vite/, /:8000 Python/]) expect((await ui.find({ type: 'Button', text: t })) != null).toBe(true)
    expect((await ui.find({ type: 'Text', text: /:22\b|49152/ })) == null).toBe(true)
    expect((await ui.find({ type: 'Text', text: 'other line' })) != null).toBe(true)
    await ui.unmount()

    // Narrow: ports only.
    const slim = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 30 }, surface })
    for (const t of [/^:3000$/, /^:5173$/, /^:8000$/]) expect((await slim.find({ type: 'Button', text: t })) != null).toBe(true)
    await slim.unmount()
  }
})

test('the band yields to a survey', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ok(LSOF))
  await $.session.start(SESSION)
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface })
    expect((await ui.find({ type: 'Text', text: /:3000/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('nothing listening: no band', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // lsof finds nothing: exit 1, no output.
  on('process.run', () => ok('', 1))
  await $.session.start(SESSION)
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /⇄/ })) == null).toBe(true)
    await ui.unmount()
  }
})

test('without lsof the band falls back to ss', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const asked: string[] = []
  on('process.run', (_, e) => {
    asked.push(e.argv[0] ?? '')
    if (e.argv[0] === 'lsof') throw new Error('spawn lsof ENOENT')
    return ok(SS)
  })
  await $.session.start(SESSION)
  await clock.settle()

  expect(asked).toEqual(['lsof', 'ss'])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  for (const t of [/:3000 node/, /:5173 vite/, /:8080/]) expect((await ui.find({ type: 'Button', text: t })) != null).toBe(true)
  await ui.unmount()
})

test('without lsof and ss the band hides and the poll does not throw', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let calls = 0
  on('process.run', () => {
    calls += 1
    throw new Error('not found')
  })
  await $.session.start(SESSION)
  await clock.advance(15_000)

  // Two tries at the start, then quiet until the retry.
  expect(calls).toBe(2)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /⇄/ })) == null).toBe(true)
  await ui.unmount()
})

test('a hanging poll does not stack: the next tick is skipped while one runs', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let calls = 0
  on('process.run', async () => {
    calls += 1
    // Answers only after 40 s, past two more ticks.
    await clock.sleep(40_000)
    return ok(LSOF)
  })
  await $.session.start(SESSION)
  await clock.advance(30_000)
  expect(calls).toBe(1)
  await clock.advance(20_000)
  // The first poll ended at 40 s; the tick at 45 s ran a new one.
  expect(calls).toBe(2)
})
