import type { CommandInfo, ToolInfo } from 'claude-code'

import type { InstalledItem, UsageItems, UsageKind } from '../types'
import { clean, keyOf, mcpHits } from './usage'

// Rough: about four characters a token. Only a guide for what to look at first.
export const estimate = (text: string): number => Math.ceil(text.length / 4)

export const MAX_INSTALLED = 400

// Skills and commands from `$.command.list()`, connectors from `$.tool.list()` (MCP tools),
// plugins from both. Built-in commands and MCP prompts are left out.
export function buildInstalled(tools: ToolInfo[], commands: CommandInfo[]): InstalledItem[] {
  const skills: InstalledItem[] = []
  const connectors = new Map<string, InstalledItem>()
  const plugins = new Map<string, number>()

  for (const c of commands) {
    if (c.source !== 'plugin' && c.source !== 'user') continue
    const name = clean(c.name)
    if (name === '') continue
    const tokens = estimate(`${c.name} ${c.description}`)
    const plugin = c.plugin === undefined ? undefined : clean(c.plugin)
    skills.push(plugin === undefined || plugin === '' ? { kind: 'skill', name, tokens } : { kind: 'skill', name, tokens, plugin })
    if (plugin !== undefined && plugin !== '') plugins.set(plugin, (plugins.get(plugin) ?? 0) + tokens)
  }

  for (const t of tools) {
    if (!t.mcp) continue
    const hits = mcpHits(t.name)
    const conn = hits.find(h => h.kind === 'connector')
    if (conn === undefined) continue
    const tokens = estimate(`${t.name} ${t.description}`)
    const old = connectors.get(conn.name)
    const plugin = hits.find(h => h.kind === 'plugin')?.name
    connectors.set(conn.name, { kind: 'connector', name: conn.name, tokens: (old?.tokens ?? 0) + tokens, ...(plugin === undefined ? {} : { plugin }) })
    if (plugin !== undefined) plugins.set(plugin, (plugins.get(plugin) ?? 0) + tokens)
  }

  const out: InstalledItem[] = [
    ...skills,
    ...connectors.values(),
    ...[...plugins].map(([name, tokens]): InstalledItem => ({ kind: 'plugin', name, tokens })),
  ]

  return out.slice(0, MAX_INSTALLED)
}

// How often an installed thing was used. A skill is also known as `plugin:name`, and a plugin skill
// may be listed with its prefix while the run names the bare skill, so all spellings count.
export function usedCount(used: UsageItems, item: InstalledItem): number {
  const names = new Set([item.name])
  if (item.kind === 'skill') {
    if (item.plugin !== undefined) names.add(`${item.plugin}:${item.name}`)
    const colon = item.name.indexOf(':')
    if (colon > 0) names.add(item.name.slice(colon + 1))
  }
  let n = 0
  for (const name of names) n += used[keyOf(item.kind, name)]?.n ?? 0

  return n
}

export const ofKind = (list: InstalledItem[], kind: UsageKind) => list.filter(x => x.kind === kind)

// "~340", "~1.2k"
export const tokenText = (n: number): string => (n < 1000 ? `~${n}` : `~${(n / 1000).toFixed(1)}k`)
