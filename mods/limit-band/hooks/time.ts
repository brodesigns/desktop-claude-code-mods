// Pure formatting, no `$`: English words, locale-neutral numbers.
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const pct = (n: number) => `${Math.round(n)}%`

// A span, coarse to fine: "2 days 3 h", "1 h 23 min", "12 min", "less than 1 min".
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
const two = (n: number) => String(n).padStart(2, '0')

// Local clock time, with the weekday when it is not today: "14:05", "Fri 09:00".
export const clockAt = (at: number, now: number) => {
  const d = new Date(at)
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`

  return new Date(now).toDateString() === d.toDateString() ? time : `${WEEKDAY[d.getDay()] ?? ''} ${time}`
}

export type Tone = 'neutral' | 'warning' | 'error'
export const toneOf = (p: number): Tone => (p >= 95 ? 'error' : p >= 80 ? 'warning' : 'neutral')
