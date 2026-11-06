import type { ToolStat, ToolStats } from '../types'
import { clean } from './usage'

export const MAX_TOOLS = 80

export type Outcome = 'ok' | 'failed' | 'denied'

// Counts one call of a built-in tool. Returns a new object.
export function bumpTool(stats: ToolStats, name: string, outcome: Outcome, ms: number): ToolStats {
  const key = clean(name)
  if (key === '') return stats
  const old: ToolStat = stats[key] ?? { name: key, n: 0, failed: 0, denied: 0, ms: 0 }
  const next: ToolStat = {
    name: key,
    n: old.n + 1,
    failed: old.failed + (outcome === 'failed' ? 1 : 0),
    denied: old.denied + (outcome === 'denied' ? 1 : 0),
    ms: old.ms + Math.max(0, Math.round(ms)),
  }
  const out = { ...stats, [key]: next }
  const names = Object.keys(out)
  if (names.length <= MAX_TOOLS) return out
  for (const n of names.sort((a, b) => (out[a]?.n ?? 0) - (out[b]?.n ?? 0)).slice(0, names.length - MAX_TOOLS)) delete out[n]

  return out
}

export function asToolStats(raw: unknown): ToolStats {
  const out: ToolStats = {}
  if (typeof raw !== 'object' || raw === null) return out
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const e = v as Partial<ToolStat> | null
    if (e === null || typeof e !== 'object' || typeof e.name !== 'string' || e.name === '') continue
    out[e.name] = { name: e.name, n: num(e.n), failed: num(e.failed), denied: num(e.denied), ms: num(e.ms) }
  }

  return out
}

// Average call time: "45ms", "1.5s".
export function avg(stat: ToolStat): string {
  const ms = stat.n === 0 ? 0 : stat.ms / stat.n

  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}
