import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { LimitRow, LimitSnap } from '../types'
import { clockAt, pct, span, toneOf } from './time'

const snap = atom({ plugin: 'limit-band', key: 'snap' } as const, null)

const LABEL: Record<string, string> = { five_hour: '5h limit', seven_day: '7-day limit', spend_limit: 'Spend limit' }
const MARK = { neutral: '◔', warning: '◕', error: '⚠' } as const
const TICK_MS = 30_000

type Settings = { threshold: number; sevenDay: boolean }
let settings: Settings = { threshold: 50, sevenDay: true }
let timer: { cancel: () => void } | null = null

// Only the windows worth showing: over the threshold, not yet reset. With none, `at` stays 0, so a
// quiet minute writes nothing and redraws nothing.
export const snapOf = (limits: readonly SessionRateLimit[], now: number, cfg: Settings): LimitSnap => {
  const rows: LimitRow[] = limits
    .filter(l => l.kind !== 'seven_day' || cfg.sevenDay)
    .map(l => ({ kind: l.kind, percent: Math.round(l.percentUsed), resetsAt: l.resetsAt === undefined ? 0 : Date.parse(l.resetsAt) || 0 }))
    .filter(r => r.percent >= cfg.threshold && (r.resetsAt === 0 || r.resetsAt > now))
    .sort((a, b) => b.percent - a.percent)

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

export const register: Register = (on, options) => {
  const threshold = Number(options.threshold ?? 50)
  settings = {
    threshold: Number.isFinite(threshold) ? Math.min(100, Math.max(0, threshold)) : 50,
    sevenDay: options.sevenDay !== false,
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
    const worst = s?.rows[0]
    if (e.props.hasSurvey || s === null || worst === undefined) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const narrow = e.props.bodyColumns < 56
    const tone = toneOf(worst.percent)
    const rows = narrow ? [worst] : s.rows

    // The bands of the plugins beneath stay drawn, under this one.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={tone === 'neutral' ? 'subtle' : tone} overflow="hidden" paddingX="sm" gap="md">
          {rows.map(r => {
            const t = toneOf(r.percent)
            const left = r.resetsAt - s.at

            return (
              <Box key={`lim-${r.kind}`} flexShrink={1} minWidth={0} overflow="hidden">
                <Text wrap="truncate">
                  <Text color={t === 'neutral' ? undefined : t} weight="semibold">
                    {MARK[t]} {LABEL[r.kind] ?? r.kind} {pct(r.percent)}
                  </Text>
                  {r.resetsAt > 0 ? (
                    <Text dimColor>
                      {' · resets in '}
                      {span(left)}
                      {narrow ? '' : ` (${clockAt(r.resetsAt, s.at)})`}
                    </Text>
                  ) : (
                    ''
                  )}
                </Text>
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
