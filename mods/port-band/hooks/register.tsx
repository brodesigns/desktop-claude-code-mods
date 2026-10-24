import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

import type { Listener } from '../types'
import { label, parseLsof, parseSs, select, wanted } from './ports'
import type { Wanted } from './ports'
import { setIfChanged } from './state'

const ports = atom({ plugin: 'port-band', key: 'portList' } as const, null)

const LSOF = ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN']
const SS = ['ss', '-ltnp']
// With no tool found, look again every 20th poll (about five minutes at 15 s).
const RETRY_EVERY = 20

// Which tool works on this machine; '' until the first poll found out.
let tool: '' | 'lsof' | 'ss' | 'none' = ''
let misses = 0
let busy = false
let timer: { cancel: () => void } | null = null

// A missing program or a timeout makes process.run reject; both read as "no answer".
async function run($: EngineInterface, argv: string[]): Promise<ProcessRunResult | null> {
  try {
    return await $.process.run(argv, { timeoutMs: 5_000 })
  } catch {
    return null
  }
}

// The listeners now. `undefined`: the known tool gave no answer this time (timeout), keep what is shown.
// `null`: no tool on this machine, hide the band.
async function scan($: EngineInterface): Promise<Listener[] | null | undefined> {
  if (tool === 'none') {
    misses += 1
    if (misses % RETRY_EVERY !== 0) return null
    tool = ''
  }
  if (tool === '' || tool === 'lsof') {
    const res = await run($, LSOF)
    // lsof exits 1 when nothing listens.
    if (res !== null && (res.exitCode === 0 || res.exitCode === 1)) {
      tool = 'lsof'
      return parseLsof(res.stdout)
    }
    if (tool === 'lsof') return undefined
  }
  if (tool === '' || tool === 'ss') {
    const res = await run($, SS)
    if (res !== null && res.exitCode === 0) {
      tool = 'ss'
      return parseSs(res.stdout)
    }
    if (tool === 'ss') return undefined
  }
  tool = 'none'

  return null
}

// One poll. Never throws, never stacks: a poll still running makes the next one a no-op.
export async function refresh($: EngineInterface, want: Wanted) {
  if (busy) return
  busy = true
  try {
    const found = await scan($)
    if (found === undefined) return
    const fresh = found === null ? null : select(found, want)
    await setIfChanged(() => read($, ports), v => update($, ports, () => v), fresh)
  } catch {
    // Nothing to show this time; the next poll tries again.
  } finally {
    busy = false
  }
}

async function start($: EngineInterface, want: Wanted, seconds: number) {
  void refresh($, want)
  timer?.cancel()
  timer = $.clock.every(seconds * 1000, () => void refresh($, want))
}

export const register: Register = (on, options) => {
  const want = wanted(options.ports)
  const seconds = Math.max(5, Math.min(300, Number(options.intervalSeconds ?? 15) || 15))

  on('session.start', async ($, e, next) => {
    await start($, want, seconds)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, ports)
    if (e.props.hasSurvey || list === null || list.length === 0) return next(e)

    // Another mod's band (beneath this one) stays: this line goes on top of it.
    const below = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const narrow = e.props.bodyColumns < 44

    // One borderless row. Each port is a button: a click copies its address.
    const band = (
      <Box key="ports" overflow="hidden" paddingX="sm" gap="sm">
        <Text color="#22d3ee" weight="semibold">⇄ Ports</Text>
        {list.map(l => {
          const name = label(l)
          const url = `http://localhost:${l.port}`

          return (
            <Button key={`port-${l.port}`} plain onPress={press => {
              void $.ui.copy({ text: url, surface: press.surface })
              void $.ui.toast(`Copied ${url}`)
            }}>
              <Text weight="semibold">{`:${l.port}`}</Text>
              {narrow || name === '' ? '' : <Text dimColor>{` ${name}`}</Text>}
            </Button>
          )
        })}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {band}
        {below}
      </Box>
    )
  })
}
