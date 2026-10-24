import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, TurnCompleteInput } from 'claude-code'

import type { Meter, TurnStat } from '../types'
import { refreshCounts } from './counts'
import { isNarrow } from './layout'
import { setIfChanged } from './state'
import { card, cardHead, emptyState, gauge, HEX, kv, legend, SPACE, tile, tiles, TYPE } from './style'

const meter = atom({ plugin: 'bro-cockpit', key: 'meter' } as const, null)
const stats = atom({ plugin: 'bro-cockpit', key: 'turnStats' } as const, [])

type Source = {
  context: { percent?: number; tokens?: number; window: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}

const toMeter = (u: Source): Meter => ({
  percent: Math.round(u.context.percent ?? 0),
  tokens: u.context.tokens ?? 0,
  window: u.context.window,
  usd: u.cost?.usd ?? 0,
  limits: u.rateLimits.map(l => ({ kind: l.kind, percent: Math.round(l.percentUsed), resetsAt: l.resetsAt ?? '' })),
})

export async function start($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    await setIfChanged(() => read($, meter), v => update($, meter, () => v), toMeter(usage))
  } catch {
    // The first reading comes with the first session.measure.
  }
}

// One finished turn of the main loop or a subagent.
export async function recordTurn($: EngineInterface, e: TurnCompleteInput) {
  if (e.usage === undefined) return
  const stat: TurnStat = {
    at: await $.clock.now(),
    ms: e.durationMs,
    input: e.usage.input_tokens,
    output: e.usage.output_tokens,
    cacheRead: e.usage.cache_read_input_tokens,
    cacheWrite: e.usage.cache_creation_input_tokens,
    isAgent: e.agentId !== undefined,
  }
  await update($, stats, list => [...list, stat].slice(-60))
}

export async function percent($: EngineInterface) {
  return (await read($, meter))?.percent ?? 0
}

export async function summary($: EngineInterface) {
  const m = await read($, meter)

  return { percent: m?.percent ?? -1, limit: m?.limits.find(l => l.kind === 'five_hour')?.percent ?? -1 }
}

export const register: Register = on => {
  // A measure whose rounded figures did not move writes nothing and redraws nothing.
  on('session.measure', async ($, e, next) => {
    if (await setIfChanged(() => read($, meter), v => update($, meter, () => v), toMeter(e))) await refreshCounts($)

    return next(e)
  })
}

const tone = (p: number) => (p >= 85 ? 'error' : p >= 60 ? 'warning' : 'success')
const hex = (p: number) => (p >= 85 ? HEX.error : p >= 60 ? HEX.warning : HEX.success)
const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const LABEL: Record<string, string> = { five_hour: '5-hour limit', seven_day: '7-day limit', spend_limit: 'Spend limit' }

// Ring at the context fill, a still picture: it shows a level, not a running state.
const ring = (p: number) => {
  const C = 138.2
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><g transform="rotate(-90 28 28)">' +
    `<circle cx="28" cy="28" r="22" fill="none" stroke="${HEX.neutral}" stroke-opacity=".28" stroke-width="6"/>` +
    `<circle cx="28" cy="28" r="22" fill="none" stroke="${hex(p)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(Math.min(100, p) / 100) * C} ${C}"/></g></svg>`
  )
}

// A flame that grows with the quota and flickers faster when it burns hot.
const flame = (p: number) => {
  const s = (0.35 + 0.65 * (Math.min(100, p) / 100)).toFixed(2)
  const dur = p >= 85 ? '0.45s' : p >= 60 ? '0.7s' : '1.1s'
  const base = hex(p)

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50">' +
    '<defs><linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="' + base + '"/><stop offset="1" stop-color="#F5C04A"/></linearGradient></defs>' +
    `<g transform="translate(20 46) scale(${s}) translate(-20 -46)">` +
    `<g><animateTransform attributeName="transform" type="scale" additive="sum" values="1 1;1.05 0.95;0.97 1.04;1 1" dur="${dur}" repeatCount="indefinite"/>` +
    '<path d="M20 3C26 14 34 20 32 32C31 40 26 45 20 45C14 45 9 40 8 32C6 22 14 18 20 3Z" fill="url(#f)"/>' +
    '<path d="M20 20C23 26 27 29 26 35C25.5 39 23 41 20 41C17 41 14.5 39 14 35C13 29 18 26 20 20Z" fill="#FFF3C4" opacity=".85"/></g></g>' +
    `<rect x="6" y="46" width="28" height="3" rx="1.5" fill="${HEX.neutral}" opacity=".35"/></svg>`
  )
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  const narrow = isNarrow(e)
  const m = await read($, meter)
  const turns = await read($, stats)
  const hasSvg = 'Svg' in ui
  const five = m?.limits.find(l => l.kind === 'five_hour')
  const others = (m?.limits ?? []).filter(l => l.kind !== 'five_hour')
  const sum = (k: 'input' | 'output' | 'cacheRead' | 'cacheWrite') => turns.reduce((n, t) => n + t[k], 0)
  const input = sum('input')
  const cacheRead = sum('cacheRead')
  const cacheAll = input + cacheRead + sum('cacheWrite')
  const hit = cacheAll === 0 ? 0 : Math.round((cacheRead / cacheAll) * 100)
  const last = turns.slice(-8)
  const maxMs = Math.max(1, ...last.map(t => t.ms))

  if (m === null) return emptyState(ui, 'meter-empty', '◔', 'No measurement yet. It comes with the next turn.')
  const resets = five !== undefined && five.resetsAt !== '' ? ` · resets ${new Date(five.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
  const mark = (p: number) => (p >= 85 ? '⚠ ' : '')

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      <Box gap={SPACE.base} flexWrap="wrap">
        {gauge(
          ui,
          'ctx',
          hasSvg && 'Svg' in ui ? <ui.Svg key="ring" source={ring(m.percent)} alt={`Context ${m.percent} percent full`} width={narrow ? 40 : 52} height={narrow ? 40 : 52} /> : <Text color={tone(m.percent)}>◔</Text>,
          `${mark(m.percent)}${m.percent}%`,
          `Context · ${fmt(m.tokens)} of ${fmt(m.window)}`,
          tone(m.percent),
          narrow,
        )}
        {gauge(
          ui,
          'flame-gauge',
          hasSvg && 'Svg' in ui ? <ui.Svg key="flame" source={flame(five?.percent ?? 0)} alt={`Flame: 5-hour limit ${five?.percent ?? 0} percent used`} width={narrow ? 32 : 40} height={narrow ? 40 : 50} isInteractive /> : <Text color="warning">♨</Text>,
          five !== undefined ? `${mark(five.percent)}${five.percent}%` : '·',
          five !== undefined ? `${LABEL[five.kind] ?? five.kind}${resets}` : 'no limit reported',
          five !== undefined ? tone(five.percent) : 'neutral',
          narrow,
        )}
      </Box>

      {others.length > 0 && card(ui, 'limits', 'neutral', others.map(l => kv(ui, `lim-${l.kind}`, LABEL[l.kind] ?? l.kind, <Text color={tone(l.percent)} size={TYPE.body} weight="semibold" tabular>{mark(l.percent)}{l.percent}%</Text>, narrow)))}

      {tiles(ui, 'meter-tiles', [
        tile(ui, `$${m.usd.toFixed(2)}`, 'Cost'),
        tile(ui, turns.length === 0 ? '·' : `${hit}%`, 'Cache hits', turns.length === 0 ? 'neutral' : hit >= 70 ? 'success' : 'warning'),
        tile(ui, String(turns.length), 'Turns'),
      ])}

      {legend(ui, 'meter-tokens', `In ${fmt(input + cacheRead)} · Out ${fmt(sum('output'))} · Cache read ${fmt(cacheRead)}`)}

      {last.length > 0 &&
        card(ui, 'turns', 'neutral', [
          cardHead(ui, 'h', 'Latest turns', <Text dimColor size={TYPE.label}>● Main · ◆ Agent</Text>),
          ...last.map((t, i) => (
            <Box key={`turn-${t.at}-${i}`} alignItems="center" gap={SPACE.base}>
              <Box width={2} flexShrink={0}>
                <Text dimColor size={TYPE.label}>{t.isAgent ? '◆' : '●'}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                <Text color={t.ms > 60_000 ? 'warning' : 'success'} size={TYPE.label} wrap="truncate">{'█'.repeat(Math.max(1, Math.round((t.ms / maxMs) * (narrow ? 8 : 16))))}</Text>
              </Box>
              <Box width={8} flexShrink={0} justifyContent="flex-end">
                <Text dimColor={t.ms <= 60_000} color={t.ms > 60_000 ? 'warning' : undefined} tabular size={TYPE.label}>{t.ms > 60_000 ? '⚠ ' : ''}{t.ms >= 1000 ? `${(t.ms / 1000).toFixed(1)}s` : `${t.ms}ms`}</Text>
              </Box>
              {!narrow && (
                <Box width={9} flexShrink={0} justifyContent="flex-end">
                  <Text dimColor tabular size={TYPE.label}>{fmt(t.output)} out</Text>
                </Box>
              )}
            </Box>
          )),
        ])}
    </Box>
  )
}
