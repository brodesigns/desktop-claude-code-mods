// Pure date parsing and English formatting for /deadline, no `$`. Every date is local time.
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// A short, stable FNV-1a hash in base 36: tells two folders of the same name apart.
const shortHash = (text: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return h.toString(36)
}

export const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? ''
// One store key per project: the folder name plus a hash of its full path.
export const keyOf = (path: string) => `deadline:${baseName(path)}:${shortHash(path)}`

export type Parsed =
  | { kind: 'show' }
  | { kind: 'clear' }
  | { kind: 'set'; at: number; text: string; hasTime: boolean }
  | { kind: 'error'; message: string }

const CLEAR = ['off', 'clear', 'delete', 'remove', 'none']
const TEXT_MAX = 60

// A real calendar day: 31.2. or 2026-13-01 are refused, not rolled over.
const dayAt = (y: number, m: number, d: number, hh: number, mm: number): number | null => {
  const date = new Date(y, m - 1, d, hh, mm, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null

  return date.getTime()
}

type DateToken = { y: number | null; m: number; d: number; hh?: number; mm?: number }

const dateToken = (token: string, now: number): DateToken | null => {
  const iso = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2}):(\d{2}))?$/)
  if (iso !== null) {
    const [, y, m, d, hh, mm] = iso
    return { y: Number(y), m: Number(m), d: Number(d), ...(hh !== undefined ? { hh: Number(hh), mm: Number(mm) } : {}) }
  }
  // Day first with dots: "1.11.", "1.11.26", "1.11.2026".
  const dotted = token.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/)
  if (dotted !== null) {
    const [, d, m, y] = dotted
    return { y: y === undefined ? null : y.length === 2 ? 2000 + Number(y) : Number(y), m: Number(m), d: Number(d) }
  }
  const lower = token.toLowerCase()
  if (lower === 'today' || lower === 'tomorrow') {
    const day = new Date(now + (lower === 'today' ? 0 : 1) * DAY)
    return { y: day.getFullYear(), m: day.getMonth() + 1, d: day.getDate() }
  }

  return null
}

// "14:00", "2:30pm", "2pm", "2 pm", each optionally after "at". Returns the time and how many tokens it took.
// A bare number without am/pm is text, not a time.
const timeTokens = (tokens: readonly string[]): { hh: number; mm: number; used: number } | null => {
  let i = tokens[0]?.toLowerCase() === 'at' ? 1 : 0
  const first = tokens[i] ?? ''
  const next = (tokens[i + 1] ?? '').toLowerCase()
  const m = first.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i)
  if (m === null) return null
  const suffix = (m[3] ?? (next === 'am' || next === 'pm' ? next : '')).toLowerCase()
  if (m[2] === undefined && suffix === '') return null
  let hh = Number(m[1])
  const mm = Number(m[2] ?? 0)
  if (suffix !== '') {
    if (hh < 1 || hh > 12) return null
    hh = (hh % 12) + (suffix === 'pm' ? 12 : 0)
  }
  i += 1
  if (m[3] === undefined && suffix !== '') i += 1

  return { hh, mm, used: i }
}

export const EXAMPLES = '/deadline 2026-11-01, /deadline 1.11.2026 14:00 Release, /deadline 1.11. Handover, /deadline off'

export const parseArgs = (args: string, now: number): Parsed => {
  const tokens = args.trim().split(/\s+/).filter(t => t !== '')
  const [first, ...rest] = tokens
  if (first === undefined) return { kind: 'show' }
  if (CLEAR.includes(first.toLowerCase())) return { kind: 'clear' }

  const date = dateToken(first, now)
  if (date === null) return { kind: 'error', message: `"${first.slice(0, 40)}" is not a date.` }
  const time = date.hh === undefined ? timeTokens(rest) : null
  const hh = date.hh ?? time?.hh
  const mm = date.mm ?? time?.mm ?? 0
  if (hh !== undefined && (hh > 23 || mm > 59)) return { kind: 'error', message: `${hh}:${String(mm).padStart(2, '0')} is not a valid time.` }
  const hasTime = hh !== undefined
  const words = rest.slice(time?.used ?? 0).join(' ').trim()
  const text = words === '' ? 'Deadline' : words.slice(0, TEXT_MAX)

  // Without a year: this year's day, or next year's once this year's has passed.
  const thisYear = new Date(now).getFullYear()
  let at = dayAt(date.y ?? thisYear, date.m, date.d, hh ?? 23, hasTime ? mm : 59)
  if (date.y === null && at !== null && at < now) at = dayAt(thisYear + 1, date.m, date.d, hh ?? 23, hasTime ? mm : 59)
  if (at === null) return { kind: 'error', message: `${first} does not exist in the calendar.` }

  return { kind: 'set', at, text, hasTime }
}

// A span, coarse to fine: "3 days 4 h", "1 day", "5 h 12 min", "less than 1 min".
export const span = (ms: number): string => {
  if (ms < MIN) return 'less than 1 min'
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const mins = Math.floor((ms % HOUR) / MIN)
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}${hours > 0 ? ` ${hours} h` : ''}`
  if (hours > 0) return `${hours} h${mins > 0 ? ` ${mins} min` : ''}`

  return `${mins} min`
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')

// "Sun Nov 1", with the year when it is not this year's, with the time when one was given.
export const dateLabel = (at: number, hasTime: boolean, now: number, withYear = false) => {
  const d = new Date(at)
  const year = withYear || d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : ''

  return `${WEEKDAY[d.getDay()] ?? ''} ${MONTH[d.getMonth()] ?? ''} ${d.getDate()}${year}${hasTime ? ` ${two(d.getHours())}:${two(d.getMinutes())}` : ''}`
}

// "in 3 days 4 h" ahead, "overdue by 2 h" past.
export const distance = (at: number, now: number) => (at >= now ? `in ${span(at - now)}` : `overdue by ${span(now - at)}`)

export type Tone = 'neutral' | 'warning' | 'error'
export const toneOf = (at: number, now: number): Tone => (at - now <= DAY ? 'error' : at - now <= 3 * DAY ? 'warning' : 'neutral')
