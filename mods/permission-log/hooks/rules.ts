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

// What a prompt is logged under. Only the engine's own `addRules` allow suggestion is a rule that can be
// copied. With none, a label such as `Bash · git` is kept instead (never in rule syntax, so it is not copied).
export function ruleFor(tool: string, suggestions: unknown, input: unknown): { rule: string; fromEngine: boolean } {
  if (Array.isArray(suggestions)) {
    for (const s of suggestions) {
      const u = s as { type?: unknown; behavior?: unknown; rules?: unknown }
      if (u?.type !== 'addRules' || u.behavior !== 'allow' || !Array.isArray(u.rules)) continue
      const rules = u.rules
        .map(r => r as { toolName?: unknown; ruleContent?: unknown })
        .filter(r => typeof r.toolName === 'string')
        .map(r => (typeof r.ruleContent === 'string' && r.ruleContent !== '' ? `${r.toolName as string}(${r.ruleContent})` : (r.toolName as string)))
      if (rules.length > 0) return { rule: clean(redact(rules.join(RULE_SEP))), fromEngine: true }
    }
  }
  const first = tool === 'Bash' ? (summaryOf(input).split(' ')[0] ?? '') : ''

  return { rule: clean(redact(first === '' ? tool : `${tool} · ${first}`)), fromEngine: false }
}

export const RULE_SEP = ' + '

// What a click on "copy" puts on the clipboard: one rule a line.
export const copyText = (rule: string) => rule.split(RULE_SEP).join('\n')

// A rule that held a secret is never offered to copy.
export const isSafe = (rule: string) => !rule.includes(MASK)

// Rules for a whole sensitive tool, or for a command that runs other code or deletes, are never suggested.
const BROAD_TOOLS = /^(Bash|Read|Edit|Write|MultiEdit|NotebookEdit|WebFetch)$/
const BROAD_WORDS = /^Bash\((rm|rmdir|curl|wget|sh|bash|zsh|sudo|eval|exec|xargs|env|nohup|python[0-9.]*|node|npx|perl|ruby|ssh|scp|dd|chmod|chown|kill|git\s+(push\s+(-f|--force)|reset\s+--hard|clean))\b/
export const isBroad = (rule: string) => rule.split(RULE_SEP).some(r => BROAD_TOOLS.test(r) || BROAD_WORDS.test(r))

export type Op = { kind: 'allowed' | 'declined'; rule: string; tool: string; fromEngine: boolean; example: string; at: number }

// Applies the ops. Returns a new map; past MAX_RULES the rules idle longest are dropped.
export function applyOps(map: RuleMap, ops: Op[]): RuleMap {
  const out: RuleMap = { ...map }
  for (const op of ops) {
    if (op.rule === '') continue
    const k = keyOf(op.rule)
    const old: RuleEntry = out[k] ?? { rule: op.rule, tool: op.tool, fromEngine: op.fromEngine, asked: 0, allowed: 0, declined: 0, first: op.at, last: op.at, example: op.example }
    out[k] = {
      ...old,
      asked: old.asked + 1,
      allowed: old.allowed + (op.kind === 'allowed' ? 1 : 0),
      declined: old.declined + (op.kind === 'declined' ? 1 : 0),
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
      fromEngine: e.fromEngine === true,
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

export const isWorth = (e: RuleEntry) => e.fromEngine && e.allowed >= WORTH_FROM && e.declined === 0 && isSafe(e.rule) && !isBroad(e.rule)

// A tool result that is the person's "no": a hook's deny, or the engine's rejection wording.
export function isRefusal(ran: { deny?: unknown; isError?: unknown; text?: unknown } | null): boolean {
  if (ran === null) return false
  if (typeof ran.deny === 'string') return true

  return ran.isError === true && typeof ran.text === 'string' && /doesn't want to proceed|does not want to proceed|permission .{0,40}denied|was rejected/i.test(ran.text)
}

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
