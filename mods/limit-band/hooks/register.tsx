import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { LimitRow, LimitSnap } from '../types'
import { clockAt, pct, span, toneOf } from './time'

const snap = atom({ plugin: 'limit-band', key: 'snap' } as const, null)

const LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'Spend' }
const MARK = { neutral: '◔', warning: '◕', error: '⚠' } as const
const TICK_MS = 30_000

type Settings = { threshold: number; sevenDay: boolean; fiveHour: boolean }
let settings: Settings = { threshold: 50, sevenDay: true, fiveHour: true }
let timer: { cancel: () => void } | null = null

// Only the windows worth showing: over the threshold, not yet reset; the 5-hour window also below it while its
// reset is known (`fiveHour`), first in the row. With none, `at` stays 0, so a quiet minute writes nothing and
// redraws nothing.
export const snapOf = (limits: readonly SessionRateLimit[], now: number, cfg: Settings): LimitSnap => {
  const rows: LimitRow[] = limits
    .filter(l => l.kind !== 'seven_day' || cfg.sevenDay)
    .map(l => ({ kind: l.kind, percent: Math.round(l.percentUsed), resetsAt: l.resetsAt === undefined ? 0 : Date.parse(l.resetsAt) || 0 }))
    .filter(r => (cfg.fiveHour && r.kind === 'five_hour' && r.resetsAt > now) || (r.percent >= cfg.threshold && (r.resetsAt === 0 || r.resetsAt > now)))
    .sort((a, b) => Number(b.kind === 'five_hour') - Number(a.kind === 'five_hour') || b.percent - a.percent)

  return { at: rows.length === 0 ? 0 : Math.floor(now / 60_000) * 60_000, rows }
}

// Writes only when the value differs (JSON compare). True when it wrote.
async function setIfChanged<T>(get: () => Promise<T>, set: (value: T) => Promise<unknown>, value: T): Promise<boolean> {
  if (JSON.stringify(await get()) === JSON.stringify(value)) return false
  await set(value)

  return true
}

async function refresh($: EngineInterface, limits?: readonly SessionRateLimit[]) {
  try {
    const list = limits ?? (await $.session.usage()).rateLimits
    const fresh = snapOf(list, await $.clock.now(), settings)
    await setIfChanged(() => read($, snap), v => update($, snap, () => v), fresh)
  } catch {
    // No reading yet; the next measure or tick tries again.
  }
}

async function start($: EngineInterface) {
  await refresh($)
  timer?.cancel()
  timer = $.clock.every(TICK_MS, () => void refresh($))
}

// Opens a folder, file or address with the system's opener. Argument vector, no shell: the target is never parsed.
async function openTarget($: EngineInterface, args: string[]) {
  for (const program of ['open', 'xdg-open']) {
    try {
      // xdg-open has no reveal flag: it opens the folder of the file instead.
      const argv = program === 'open' ? [program, ...args] : [program, args[args.length - 1] ?? '']
      const res = await $.process.run(argv, { timeoutMs: 5_000 })
      if (res.exitCode === 0) return
    } catch {
      // This opener is not there; the next one tries.
    }
  }
  $.ui.toast(`Could not open ${args[args.length - 1] ?? ''}`)
}

const USAGE_URL = 'https://claude.ai/settings/usage'

export const register: Register = (on, options) => {
  const threshold = Number(options.threshold ?? 50)
  settings = {
    threshold: Number.isFinite(threshold) ? Math.min(100, Math.max(0, threshold)) : 50,
    sevenDay: options.sevenDay !== false,
    fiveHour: options.fiveHour !== false,
  }

  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refresh($, e.rateLimits)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await refresh($)

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    // Narrow: only the fullest window; the rows are ordered with the 5-hour one first.
    const worst = s?.rows.reduce<LimitRow | undefined>((a, b) => (a === undefined || b.percent > a.percent ? b : a), undefined)
    if (e.props.hasSurvey || s === null || worst === undefined) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const narrow = e.props.bodyColumns < 56
    const rows = narrow ? [worst] : s.rows

    // The bands of the plugins beneath stay drawn, under this one.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm" gap="md">
          <Text color="#39639E" size="caption">▌</Text>
          {rows.map(r => {
            const t = toneOf(r.percent)
            const left = r.resetsAt - s.at

            return (
              <Box key={`lim-${r.kind}`} flexShrink={1} minWidth={0} overflow="hidden">
                <Button plain key={`lim-btn-${r.kind}`} onPress={() => void openTarget($, [USAGE_URL])}>
                  <Text size="caption" color={t === 'neutral' ? undefined : t} weight="semibold">
                    {MARK[t]} {LABEL[r.kind] ?? r.kind} {pct(r.percent)}
                  </Text>
                  {r.resetsAt > 0 ? (
                    <Text size="caption" dimColor>
                      {` · ↻ ${span(left)}`}
                    </Text>
                  ) : (
                    ''
                  )}
                </Button>
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
