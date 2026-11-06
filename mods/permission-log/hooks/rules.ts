import type { RuleEntry, RuleMap } from '../types'
import { redact } from './keys'

export const MAX_RULES = 150
const MAX_TEXT = 120
// Allowed this often and never declined: worth an allow rule.
export const WORTH_FROM = 3
export const MASK = '[secret removed]'

// One line, no control characters (the engine refuses a tree that holds one), capped.
export const clean = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)

export const keyOf = (rule: string) => `r:${rule}`

const FIELDS = ['command', 'file_path', 'path', 'url', 'pattern', 'query', 'notebook_path'] as const

// The one line that says what was asked: the command, file, address or pattern. Redacted.
export function summaryOf(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const o = input as Record<string, unknown>
  for (const f of FIELDS) {
    const v = o[f]
    if (typeof v === 'string' && v !== '') return clean(redact(v))
  }

  return ''
}

// The rule to allow: the engine's own suggestion if it has one, else the tool name
// (a first word for Bash). Redacted; a rule that held a secret ends up with the mask in it.
export function ruleOf(tool: string, suggestions: unknown, input: unknown): string {
  if (Array.isArray(suggestions)) {
    for (const s of suggestions) {
      const u = s as { type?: unknown; behavior?: unknown; rules?: unknown }
      if (u?.type !== 'addRules' || u.behavior !== 'allow' || !Array.isArray(u.rules)) continue
      const r = u.rules[0] as { toolName?: unknown; ruleContent?: unknown } | undefined
      if (typeof r?.toolName !== 'string') continue
      return clean(redact(typeof r.ruleContent === 'string' && r.ruleContent !== '' ? `${r.toolName}(${r.ruleContent})` : r.toolName))
    }
  }
  const text = summaryOf(input)
  if (tool === 'Bash' && text !== '') return clean(`Bash(${text.split(' ')[0] ?? ''}:*)`)

  return clean(redact(tool))
}

// A rule that held a secret is never offered to copy.
export const isSafe = (rule: string) => !rule.includes(MASK)

export type Op = { kind: 'asked' | 'allowed' | 'declined' | 'refused'; rule: string; tool: string; example: string; at: number }

// Applies the ops. Returns a new map; past MAX_RULES the rules idle longest are dropped.
export function applyOps(map: RuleMap, ops: Op[]): RuleMap {
  const out: RuleMap = { ...map }
  for (const op of ops) {
    if (op.rule === '') continue
    const k = keyOf(op.rule)
    const old: RuleEntry = out[k] ?? { rule: op.rule, tool: op.tool, asked: 0, allowed: 0, declined: 0, first: op.at, last: op.at, example: op.example }
    out[k] = {
      ...old,
      asked: old.asked + (op.kind === 'asked' || op.kind === 'refused' ? 1 : 0),
      allowed: old.allowed + (op.kind === 'allowed' ? 1 : 0),
      declined: old.declined + (op.kind === 'declined' || op.kind === 'refused' ? 1 : 0),
      last: op.at,
      example: op.example !== '' ? op.example : old.example,
    }
  }
  const keys = Object.keys(out)
  if (keys.length <= MAX_RULES) return out
  for (const k of keys.sort((a, b) => (out[a]?.last ?? 0) - (out[b]?.last ?? 0)).slice(0, keys.length - MAX_RULES)) delete out[k]

  return out
}

// Whatever the store holds, as a clean map.
export function asRules(raw: unknown): RuleMap {
  const out: RuleMap = {}
  if (typeof raw !== 'object' || raw === null) return out
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const e = v as Partial<RuleEntry> | null
    if (e === null || typeof e !== 'object' || typeof e.rule !== 'string' || typeof e.tool !== 'string') continue
    const rule = clean(e.rule)
    if (rule === '') continue
    out[keyOf(rule)] = {
      rule,
      tool: clean(e.tool),
      asked: num(e.asked),
      allowed: num(e.allowed),
      declined: num(e.declined),
      first: num(e.first),
      last: num(e.last),
      example: typeof e.example === 'string' ? clean(redact(e.example)) : '',
    }
  }
  const keys = Object.keys(out)
  if (keys.length > MAX_RULES) for (const k of keys.sort((a, b) => (out[a]?.last ?? 0) - (out[b]?.last ?? 0)).slice(0, keys.length - MAX_RULES)) delete out[k]

  return out
}

export const isWorth = (e: RuleEntry) => e.allowed >= WORTH_FROM && e.declined === 0 && isSafe(e.rule)

export function rank(map: RuleMap, view: string): RuleEntry[] {
  const list = Object.values(map)

  return view === 'worth' ? list.filter(isWorth).sort((a, b) => b.allowed - a.allowed || b.last - a.last) : list.sort((a, b) => b.asked - a.asked || b.last - a.last)
}

// "now", "5m", "3h", "12d": how long ago.
export function ago(now: number, then: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`

  return `${Math.floor(s / 86400)}d`
}
