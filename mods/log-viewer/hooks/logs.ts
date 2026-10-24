import type { LogEntry, LogLine, LogStatus } from '../types'
import { redact } from './keys'

// Pure helpers: turning a Bash result into what the pane keeps. No `$`, no state.

export const MAX_ENTRIES = 40
// Only the newest entries keep their output; older ones keep the head line.
export const KEEP_OUTPUT = 10
export const MAX_LINES = 120
export const MAX_LINE = 300
export const MAX_COMMAND = 500

// The end of a word only, so `TypeError` counts and `errorless` does not.
const ERROR = /(error|errors|exception)\b|\b(failed|failure|fatal|panic|traceback)\b|\berr!|✗/i
const WARN = /(warn|warning|warnings)\b|\b(deprecated)\b|⚠/i

// error beats warn: a line with both is an error line.
export const tone = (text: string): 'error' | 'warning' | undefined => (ERROR.test(text) ? 'error' : WARN.test(text) ? 'warning' : undefined)

const cutLine = (line: string) => (line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line)

// Text to lines: redacted, trailing blank lines dropped, each line capped.
export const toLines = (text: string, err: boolean): LogLine[] => {
  const lines = redact(text.replace(/\r\n?/g, '\n')).split('\n')
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()

  return lines.map(t => ({ t: cutLine(t), err }))
}

// The tail of the output, since a log's end (the error, the summary) matters most.
export const capLines = (lines: LogLine[]): { lines: LogLine[]; cut: number } =>
  lines.length > MAX_LINES ? { lines: lines.slice(-MAX_LINES), cut: lines.length - MAX_LINES } : { lines, cut: 0 }

export const cleanCommand = (command: unknown) => {
  const text = redact(String(command ?? '')).trim()

  return text.length > MAX_COMMAND ? `${text.slice(0, MAX_COMMAND - 1)}…` : text
}

export type Outcome = { status: LogStatus; exitCode: number | null; note: string; lines: LogLine[]; cut: number }

type Ran = { deny?: unknown; isError?: unknown; result?: unknown; text?: unknown }

// What one finished Bash call left: status, exit code, a one-line note and its output lines.
export const outcome = (ran: Ran): Outcome => {
  if (typeof ran.deny === 'string') return { status: 'denied', exitCode: null, note: redact(ran.deny).slice(0, 200), lines: [], cut: 0 }

  if (ran.isError === true) {
    const text = typeof ran.text === 'string' ? ran.text : typeof ran.result === 'string' ? ran.result : ''
    const code = text.match(/^Exit code (\d+)/)
    const body = code !== null ? text.slice(code[0].length).replace(/^\n/, '') : text
    const all = toLines(body, false)
    const first = all.find(l => l.t.trim() !== '')?.t ?? ''
    const interrupted = /interrupted/i.test(text) && code === null

    return {
      status: interrupted ? 'interrupted' : 'error',
      exitCode: code !== null ? Number(code[1]) : null,
      note: first.slice(0, 200),
      ...capLines(all),
    }
  }

  const r = (ran.result ?? {}) as { stdout?: unknown; stderr?: unknown; interrupted?: unknown; backgroundTaskId?: unknown }
  const out = toLines(typeof r.stdout === 'string' ? r.stdout : '', false)
  const err = toLines(typeof r.stderr === 'string' ? r.stderr : '', true)
  const status: LogStatus = typeof r.backgroundTaskId === 'string' && r.backgroundTaskId !== '' ? 'background' : r.interrupted === true ? 'interrupted' : 'ok'

  return { status, exitCode: status === 'ok' ? 0 : null, note: '', ...capLines([...out, ...err]) }
}

// Appends or replaces one entry, keeps the newest MAX_ENTRIES and drops the output of all but the newest KEEP_OUTPUT.
export const keep = (list: LogEntry[], entry: LogEntry): LogEntry[] => {
  const has = list.some(x => x.id === entry.id)
  const next = (has ? list.map(x => (x.id === entry.id ? entry : x)) : [...list, entry]).slice(-MAX_ENTRIES)
  const from = next.length - KEEP_OUTPUT

  return next.map((x, i) => (i < from && x.lines.length > 0 ? { ...x, lines: [], cut: x.cut + x.lines.length } : x))
}

export const isProblem = (x: LogEntry) => x.status === 'error' || x.status === 'interrupted'

export const short = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

// The words for a status, never colour alone.
export const MARK: Record<LogStatus, { glyph: string; color: string; word: string }> = {
  running: { glyph: '⚙', color: 'warning', word: 'running' },
  ok: { glyph: '✓', color: 'success', word: 'exit 0' },
  error: { glyph: '✗', color: 'error', word: 'error' },
  denied: { glyph: '⛨', color: 'warning', word: 'blocked' },
  interrupted: { glyph: '■', color: 'warning', word: 'interrupted' },
  background: { glyph: '◐', color: 'suggestion', word: 'background' },
}

export const statusWord = (x: LogEntry) => (x.status === 'error' && x.exitCode !== null ? `exit ${x.exitCode}` : MARK[x.status].word)
