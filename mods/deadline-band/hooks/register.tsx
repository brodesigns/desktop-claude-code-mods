import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Deadline, DeadlineView } from '../types'
import { baseName, dateLabel, distance, EXAMPLES, keyOf, parseArgs, toneOf } from './when'

const current = atom({ plugin: 'deadline-band', key: 'current' } as const, null)
const minute = atom({ plugin: 'deadline-band', key: 'minute' } as const, 0)

const DAY = 24 * 60 * 60_000
const TICK_MS = 60_000

let fromDays = 0
let knownCwd = ''
let timer: { cancel: () => void } | null = null

// What an earlier version (or a hand edit) stored is read only when it has the right fields.
const asDeadline = (v: unknown): Deadline | null => {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.at !== 'number' || !Number.isFinite(o.at) || typeof o.text !== 'string') return null

  return { at: o.at, text: o.text, hasTime: o.hasTime === true }
}

// Writes only when the value differs (JSON compare). True when it wrote.
async function setIfChanged<T>(get: () => Promise<T>, set: (value: T) => Promise<unknown>, value: T): Promise<boolean> {
  if (JSON.stringify(await get()) === JSON.stringify(value)) return false
  await set(value)

  return true
}

// A missing git binary makes process.run throw; that counts as "no repository".
async function git($: EngineInterface, args: string[]) {
  try {
    return await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: 5_000 })
  } catch {
    return null
  }
}

// The main repository's folder (also from a worktree), else the session's root.
async function projectPath($: EngineInterface) {
  const common = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (common !== null && common.exitCode === 0 && common.stdout.trim() !== '') {
    const dir = common.stdout.trim()
    return dir.endsWith('/.git') ? dir.slice(0, -5) : dir
  }

  return $.session.root()
}

// The project and its stored deadline; again only after the session's directory moved, or when forced.
async function load($: EngineInterface, force: boolean): Promise<DeadlineView> {
  const cwd = await $.session.cwd()
  const have = await read($, current)
  if (!force && have !== null && cwd === knownCwd) return have
  const path = await projectPath($)
  const project = baseName(path)
  const key = keyOf(path)
  const view: DeadlineView = { key, project, deadline: asDeadline(await $.store.get(key)) }
  await setIfChanged(() => read($, current), v => update($, current, () => v), view)
  knownCwd = cwd

  return view
}

// The minute only moves while a deadline is set, so a project without one writes nothing.
async function tick($: EngineInterface) {
  try {
    const view = await load($, false)
    if (view.deadline === null) return
    const now = Math.floor((await $.clock.now()) / 60_000) * 60_000
    await setIfChanged(() => read($, minute), v => update($, minute, () => v), now)
  } catch {
    // Tried again on the next tick.
  }
}

async function start($: EngineInterface) {
  await $.command.register({ name: 'deadline', description: 'Deadline for this project: /deadline <date> [time] [text], /deadline off' })
  await tick($)
  timer?.cancel()
  timer = $.clock.every(TICK_MS, () => void tick($))
}

async function run($: EngineInterface, args: string): Promise<string> {
  const now = await $.clock.now()
  const parsed = parseArgs(args, now)
  if (parsed.kind === 'error') return `Not saved: ${parsed.message} Examples: ${EXAMPLES}`

  let view: DeadlineView
  try {
    view = await load($, true)
  } catch {
    return 'Nothing changed: the project could not be determined.'
  }
  const { project, deadline } = view

  if (parsed.kind === 'show') {
    return deadline === null
      ? `No deadline set for ${project}. Examples: ${EXAMPLES}`
      : `${deadline.text} (${project}): ${dateLabel(deadline.at, deadline.hasTime, now, true)}, ${distance(deadline.at, now)}.`
  }

  if (parsed.kind === 'clear') {
    if (deadline === null) return `No deadline set for ${project}, nothing deleted.`
    try {
      await $.store.delete(view.key)
    } catch {
      return 'Not deleted: the plugin store refused.'
    }
    await update($, current, () => ({ ...view, deadline: null }))

    return `Deadline for ${project} deleted.`
  }

  const fresh: Deadline = { at: parsed.at, text: parsed.text, hasTime: parsed.hasTime }
  try {
    await $.store.set(view.key, fresh)
  } catch {
    return 'Not saved: the plugin store refused the value.'
  }
  await update($, current, () => ({ ...view, deadline: fresh }))
  await update($, minute, () => Math.floor(now / 60_000) * 60_000)
  const when = `${dateLabel(fresh.at, fresh.hasTime, now, true)}${fresh.hasTime ? '' : ' (end of day)'}`

  return `Saved for ${project}: ${fresh.text} on ${when}, ${distance(fresh.at, now)}.`
}

export const register: Register = (on, options) => {
  const days = Number(options.fromDays ?? 0)
  fromDays = Number.isFinite(days) && days > 0 ? days : 0

  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  on('command.run', { command: 'deadline' }, async ($, e) => ({ text: await run($, String(e.args ?? '')) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const view = await read($, current)
    // Read to redraw each minute; the countdown itself counts from the clock.
    await read($, minute)
    const deadline = view?.deadline ?? null
    if (e.props.hasSurvey || view === null || deadline === null) return next(e)
    const now = await $.clock.now()
    if (fromDays > 0 && deadline.at - now > fromDays * DAY) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const tone = toneOf(deadline.at, now)
    const narrow = e.props.bodyColumns < 44

    // The bands of the plugins beneath stay drawn, under this one.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm" gap="sm">
          <Text color="#39639E" size="caption">▌</Text>
          <Button key="deadline" plain onPress={() => void $.ui.toast(`${deadline.text} ${distance(deadline.at, now)} · ${dateLabel(deadline.at, deadline.hasTime, now)}`)}>
            <Text size="caption" color={tone === 'neutral' ? undefined : tone} weight="semibold">
              {tone === 'error' ? '⚠' : '⏳'} {deadline.text} {distance(deadline.at, now)}
            </Text>
            {narrow ? '' : <Text size="caption" dimColor>{` · ${dateLabel(deadline.at, deadline.hasTime, now)}`}</Text>}
          </Button>
        </Box>
        {below}
      </Box>
    )
  })
}
