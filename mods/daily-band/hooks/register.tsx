import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DayTotals } from '../types'
import { asEntry, dateOf, dayKey, duration, entryKey, money, plural, PREFIX } from './day'

const today = atom({ plugin: 'daily-band', key: 'today' } as const, null)
const costSeen = atom({ plugin: 'daily-band', key: 'costSeen' } as const, -1)
const seenTurns = atom({ plugin: 'daily-band', key: 'seenTurns' } as const, [])

const TICK_MS = 60_000
const KEEP_DAYS = 7

let settings = { show: true, commits: true }
let timer: { cancel: () => void } | null = null
// One count at a time (cost seen, own entry): a turn and a measure may land together.
let queue: Promise<unknown> = Promise.resolve()
let author = { cwd: '', email: '' }
// Today's commit count, kept between refreshes: counting spawns git, so it runs on the minute tick, at start and
// after a Bash call that may have committed, never on every turn or measure.
let lastCommits: number | null = null
// One refresh at a time; a request while one runs makes it go round once more.
let running: Promise<void> | null = null
let isDue = false
let isCommitsDue = false

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

// Today's commits on HEAD by the configured author (all authors when none is set); null without a repository.
async function commitsToday($: EngineInterface): Promise<number | null> {
  const cwd = await $.session.cwd()
  if (author.cwd !== cwd) {
    const res = await git($, ['config', 'user.email'])
    author = { cwd, email: res !== null && res.exitCode === 0 ? res.stdout.trim() : '' }
  }
  const args = ['rev-list', '--count', '--since=midnight', ...(author.email !== '' ? [`--author=${author.email}`] : []), 'HEAD']
  const res = await git($, args)
  if (res === null || res.exitCode !== 0) return null
  const n = Number(res.stdout.trim())

  return Number.isFinite(n) ? n : null
}

// Sums every session's entry of today, so another session's turns show here within a minute. No process runs here.
async function recompute($: EngineInterface) {
  try {
    const date = dayKey(await $.clock.now())
    const keys = (await $.store.keys()).filter(k => k.startsWith(`${PREFIX}${date}:`))
    const totals: DayTotals = { date, ms: 0, turns: 0, usd: 0, commits: null, sessions: keys.length }
    for (const key of keys) {
      const one = asEntry(await $.store.get(key))
      totals.ms += one.ms
      totals.turns += one.turns
      totals.usd += one.usd
    }
    totals.usd = Math.round(totals.usd * 10_000) / 10_000
    totals.commits = settings.commits ? lastCommits : null
    await setIfChanged(() => read($, today), v => update($, today, () => v), totals)
  } catch {
    // Tried again on the next tick.
  }
}

// What the session's cost grew by since it was last counted. A ledger that went down started over.
async function costDelta($: EngineInterface, usd: number | undefined) {
  if (usd === undefined || !Number.isFinite(usd)) return 0
  const seen = await read($, costSeen)
  if (seen === usd) return 0
  await update($, costSeen, () => usd)
  if (seen < 0) return 0

  return usd >= seen ? usd - seen : usd
}

async function addOwn($: EngineInterface, ms: number, turns: number, usd: number) {
  if (ms <= 0 && turns <= 0 && usd <= 0) return
  const key = entryKey(dayKey(await $.clock.now()), await $.session.id())
  const old = asEntry(await $.store.get(key))
  await $.store.set(key, { ms: old.ms + ms, turns: old.turns + turns, usd: old.usd + usd })
}

async function cycle($: EngineInterface) {
  try {
    do {
      isDue = false
      if (isCommitsDue) {
        isCommitsDue = false
        lastCommits = await commitsToday($)
      }
      await recompute($)
    } while (isDue)
  } catch {
    // Tried again on the next tick.
  } finally {
    running = null
  }
}

// Serialised: overlapping runs could write an older total last. A caller that arrives while one runs waits for it,
// and the run goes round once more so the caller's change is in. `commits` asks for a fresh git count first.
function refresh($: EngineInterface, commits: boolean): Promise<void> {
  if (commits && settings.commits) isCommitsDue = true
  if (running !== null) {
    isDue = true

    return running
  }
  running = cycle($)

  return running
}

function enqueue(work: () => Promise<unknown>) {
  const run = queue.then(work).catch(() => undefined)
  queue = run

  return run
}

// Keys older than a week go; the rest stay for a later week view.
async function prune($: EngineInterface) {
  const oldest = dayKey((await $.clock.now()) - KEEP_DAYS * 24 * 60 * 60_000)
  for (const key of await $.store.keys()) {
    if (key.startsWith(PREFIX) && dateOf(key) < oldest) await $.store.delete(key)
  }
}

async function start($: EngineInterface) {
  try {
    // A fresh session counts from its cost now; after a reload the state still holds the last count.
    if ((await read($, costSeen)) < 0) {
      const usd = (await $.session.usage()).cost?.usd ?? 0
      await update($, costSeen, () => usd)
    }
    await prune($)
  } catch {
    // Counting starts with the next turn.
  }
  await refresh($, true)
  timer?.cancel()
  timer = $.clock.every(TICK_MS, () => void refresh($, true))
}

// A main-loop turn: its wall-clock time, one turn, and the cost it added. Counted once per turn id.
async function countTurn($: EngineInterface, turnId: string, ms: number) {
  const seen = await read($, seenTurns)
  if (seen.includes(turnId)) return
  await update($, seenTurns, list => [...list, turnId].slice(-30))
  let total: number | undefined
  try {
    total = (await $.session.usage()).cost?.usd
  } catch {
    total = undefined
  }
  await addOwn($, Math.max(0, ms), 1, await costDelta($, total))
}

async function countCost($: EngineInterface, total: number | undefined) {
  await addOwn($, 0, 0, await costDelta($, total))
}

export const register: Register = (on, options) => {
  settings = { show: options.show !== false, commits: options.commits !== false }

  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await enqueue(() => countTurn($, e.turnId, e.durationMs))
      await refresh($, false)
    }

    return done
  })

  // Subagents and background work add cost between turns.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('cost')) {
      await enqueue(() => countCost($, e.cost?.usd))
      await refresh($, false)
    }

    return next(e)
  })

  // A commit, merge, rebase or cherry-pick by Claude changes today's count; nothing else needs git.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (settings.commits && /\bgit\s+(commit|merge|rebase|cherry-pick)/.test(String(e.command))) await refresh($, true)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const t = await read($, today)
    if (!settings.show || e.props.hasSurvey || t === null || t.turns === 0) return next(e)
    // After midnight the old day is gone even before the next tick.
    if (t.date !== dayKey(await $.clock.now())) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const isNarrow = e.props.bodyColumns < 44
    const time = duration(t.ms)
    const cost = t.usd > 0 ? [`≈ ${money(t.usd)}`] : []
    const counts = [plural(t.turns, 'turn', 'turns'), ...(t.commits !== null && t.commits > 0 ? [plural(t.commits, 'commit', 'commits')] : [])]
    // Narrow: time and cost only; the copied summary stays complete.
    const shown = isNarrow ? [time, ...cost] : [time, ...cost, ...counts]
    const summary = [time, ...cost, ...counts].join(' · ')

    // The bands of the plugins beneath stay drawn, under this one.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm" gap="sm">
          <Box flexShrink={0}><Text color="#39639E" size="caption">▌</Text></Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Button key="daily" plain onPress={press => {
              void $.ui.copy({ text: `Today: ${summary}`, surface: press.surface })
              void $.ui.toast('Copied today\'s summary')
            }}>
              <Text size="caption" weight="semibold" wrap="truncate">☀ Today </Text>
              <Text size="caption" dimColor wrap="truncate">{shown.join(' · ')}</Text>
            </Button>
          </Box>
        </Box>
        {below}
      </Box>
    )
  })
}
