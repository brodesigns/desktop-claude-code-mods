import type { UsageEntry, UsageItems, UsageKind } from '../types'

export const MAX_ENTRIES = 300
const MAX_NAME = 80

export type Hit = { kind: UsageKind; name: string }

// Names come from skill files and MCP configs: one line, no control characters, capped.
export const clean = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_NAME)

export const keyOf = (kind: UsageKind, name: string) => `${kind}:${name}`

// `mcp__server__tool`: the connector (server) and, for a plugin's own server
// (`plugin_<plugin>_<server>`), the plugin that ships it. Null for any other tool.
export function mcpHits(tool: string): Hit[] {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (m === null) return []
  const server = m[1] ?? ''
  const own = /^plugin_(.+)_([^_]+)$/.exec(server)
  if (own !== null) return [{ kind: 'connector', name: clean(own[2] ?? '') }, { kind: 'plugin', name: clean(own[1] ?? '') }]

  return [{ kind: 'connector', name: clean(server.replace(/^claude_ai_/, 'claude.ai ').replace(/_/g, ' ')) }]
}

// A skill run: the skill, and the plugin that ships it.
export function skillHits(skill: string, pluginName?: string): Hit[] {
  const hits: Hit[] = [{ kind: 'skill', name: clean(skill) }]
  if (pluginName !== undefined && pluginName !== '') hits.push({ kind: 'plugin', name: clean(pluginName) })

  return hits
}

// Counts the hits. Returns a new object; past MAX_ENTRIES the entries idle longest are dropped.
export function bump(items: UsageItems, hits: Hit[], now: number): UsageItems {
  const out: UsageItems = { ...items }
  for (const h of hits) {
    if (h.name === '') continue
    const k = keyOf(h.kind, h.name)
    const old = out[k]
    out[k] = old === undefined ? { kind: h.kind, name: h.name, n: 1, first: now, last: now } : { ...old, n: old.n + 1, last: now }
  }
  const keys = Object.keys(out)
  if (keys.length <= MAX_ENTRIES) return out
  const oldest = keys.sort((a, b) => (out[a]?.last ?? 0) - (out[b]?.last ?? 0)).slice(0, keys.length - MAX_ENTRIES)
  for (const k of oldest) delete out[k]

  return out
}

// Whatever the store holds, as a clean map: wrong shapes and bad numbers are dropped.
export function asItems(raw: unknown): UsageItems {
  const out: UsageItems = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const e = v as Partial<UsageEntry> | null
    if (e === null || typeof e !== 'object') continue
    if (e.kind !== 'skill' && e.kind !== 'plugin' && e.kind !== 'connector') continue
    if (typeof e.name !== 'string' || e.name === '') continue
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
    out[keyOf(e.kind, e.name)] = { kind: e.kind, name: e.name, n: num(e.n), first: num(e.first), last: num(e.last) }
  }

  return out
}

// The entries of one kind: 'most' = most used first, 'least' = least used first, ties by longest idle.
export function rank(items: UsageItems, kind: UsageKind, sort: string): UsageEntry[] {
  const list = Object.values(items).filter(x => x.kind === kind)

  return sort === 'least' ? list.sort((a, b) => a.n - b.n || a.last - b.last) : list.sort((a, b) => b.n - a.n || b.last - a.last)
}

// "just now", "5m", "3h", "12d": how long ago.
export function ago(now: number, then: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`

  return `${Math.floor(s / 86400)}d`
}
