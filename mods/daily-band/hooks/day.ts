// Pure helpers, no `$`: local day keys, the per-session store entry, display formatting.
export type Entry = { ms: number; turns: number; usd: number }

const two = (n: number) => String(n).padStart(2, '0')

// The local calendar day, "2026-10-23": sorts as text, keys the store.
export const dayKey = (ms: number) => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

export const PREFIX = 'day:'
// One key per day and session: each session writes only its own, so sessions never overwrite each other.
export const entryKey = (date: string, session: string) => `${PREFIX}${date}:${session}`
export const dateOf = (key: string) => key.slice(PREFIX.length, PREFIX.length + 10)

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
export const asEntry = (v: unknown): Entry => {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

  return { ms: num(o.ms), turns: Math.round(num(o.turns)), usd: num(o.usd) }
}

// "2 h 10 min", "12 min", "45 s".
export const duration = (ms: number) => {
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return `${Math.floor(ms / 1000)} s`
  const h = Math.floor(mins / 60)

  return h > 0 ? `${h} h${mins % 60 > 0 ? ` ${mins % 60} min` : ''}` : `${mins} min`
}

// "$4.20", "$1,234.50", or the user's own locale format (none passed), always two decimals.
export const money = (usd: number) =>
  usd.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
