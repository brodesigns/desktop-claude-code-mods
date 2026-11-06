import type { UsageEntry, UsageItems, UsageKind } from '../types'

export const MAX_ENTRIES = 300
const MAX_NAME = 80

export type Hit = { kind: UsageKind; name: string }

// Names come from skill files and MCP configs: one line, no control characters, capped.
export const clean = (text: string): string =>
  // C0 and C1 control characters: the engine refuses a tree that holds one.
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, MAX_NAME)

export const keyOf = (kind: UsageKind, name: string) => `${kind}:${name}`

// MCP names spell every character outside letters, digits, `_` and `-` as `_`.
const norm = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, '_')

// `mcp__server__tool`: the connector (server) and, for a plugin's own server
// (`plugin_<plugin>_<server>`), the plugin that ships it. `known` are plugin names the caller knows;
// the longest one that fits wins, so a server name with `_` in it is not cut in the wrong place.
export function mcpHits(tool: string, known: string[] = []): Hit[] {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (m === null) return []
  const server = m[1] ?? ''
  const match = known
    .filter(k => k !== '' && server.startsWith(`plugin_${norm(k)}_`))
    .sort((a, b) => b.length - a.length)[0]
  // A tool a plugin registered itself (`mcp__<plugin>__<tool>`) is the plugin's, not a connector.
  const self = known.find(k => k !== '' && norm(k) === server)
  if (self !== undefined) return [{ kind: 'plugin', name: clean(self) }]
  // A plugin's own server is named with its plugin, so two plugins with a `browser` stay apart.
  if (match !== undefined) {
    const srv = server.slice(`plugin_${norm(match)}_`.length)

    return [{ kind: 'connector', name: clean(`${srv} (${match})`) }, { kind: 'plugin', name: clean(match) }]
  }
  const own = /^plugin_(.+)_([^_]+)$/.exec(server)
  if (own !== null) return [{ kind: 'connector', name: clean(`${own[2] ?? ''} (${own[1] ?? ''})`) }, { kind: 'plugin', name: clean(own[1] ?? '') }]

  return [{ kind: 'connector', name: clean(server.replace(/^claude_ai_/, 'claude.ai ').replace(/_/g, ' ')) }]
}

// A skill run: the skill, and the plugin that ships it. A plugin's skill is recorded as `plugin:skill`
// so it is not mixed up with a skill of the same bare name from elsewhere.
export function skillHits(skill: string, pluginName?: string): Hit[] {
  const hasPlugin = pluginName !== undefined && pluginName !== ''
  const name = hasPlugin && !skill.includes(':') ? `${pluginName}:${skill}` : skill
  const hits: Hit[] = [{ kind: 'skill', name: clean(name) }]
  if (hasPlugin) hits.push({ kind: 'plugin', name: clean(pluginName) })

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
    if (typeof e.name !== 'string') continue
    const name = clean(e.name)
    if (name === '') continue
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
    out[keyOf(e.kind, name)] = { kind: e.kind, name, n: num(e.n), first: num(e.first), last: num(e.last) }
  }
  const keys = Object.keys(out)
  if (keys.length > MAX_ENTRIES) for (const k of keys.sort((a, b) => (out[a]?.last ?? 0) - (out[b]?.last ?? 0)).slice(0, keys.length - MAX_ENTRIES)) delete out[k]

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
