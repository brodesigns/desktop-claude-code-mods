import type { CommandInfo, ToolInfo } from 'claude-code'

import type { InstalledItem, UsageItems, UsageKind } from '../types'
import { clean, keyOf, mcpHits } from './usage'

// Rough: about four characters a token. Only a guide for what to look at first.
export const estimate = (text: string): number => Math.ceil(text.length / 4)

// Per kind, so many skills do not push out the connectors and plugins.
export const MAX_INSTALLED = 200

// Skills and commands from `$.command.list()`, connectors from `$.tool.list()` (MCP tools),
// plugins from both. Built-in commands and MCP prompts are left out.
export function buildInstalled(tools: ToolInfo[], commands: CommandInfo[]): InstalledItem[] {
  const skills: InstalledItem[] = []
  const seen = new Set<string>()
  // Plugin names the commands carry: they decide where a plugin's MCP server name is cut.
  const known = [...new Set(commands.flatMap(c => (c.plugin === undefined ? [] : [clean(c.plugin)])))]
  const connectors = new Map<string, InstalledItem>()
  const plugins = new Map<string, number>()

  for (const c of commands) {
    if (c.source !== 'plugin' && c.source !== 'user') continue
    const name = clean(c.name)
    // This mod's own command is code, not a skill.
    // A plugin's skills are named `plugin:skill`; a bare name from a plugin is a code command, not context.
    const isCode = c.source === 'plugin' && c.plugin !== undefined && !c.name.includes(':')
    if (name === '' || name === 'toolusage' || isCode || seen.has(name)) continue
    seen.add(name)
    const tokens = estimate(`${c.name} ${c.description}`)
    const plugin = c.plugin === undefined ? undefined : clean(c.plugin)
    skills.push(plugin === undefined || plugin === '' ? { kind: 'skill', name, tokens } : { kind: 'skill', name, tokens, plugin })
    if (plugin !== undefined && plugin !== '') plugins.set(plugin, (plugins.get(plugin) ?? 0) + tokens)
  }

  for (const t of tools) {
    if (!t.mcp) continue
    const hits = mcpHits(t.name, known)
    const conn = hits.find(h => h.kind === 'connector')
    const tokens = estimate(`${t.name} ${t.description}`)
    if (conn === undefined) {
      const owner = hits.find(h => h.kind === 'plugin')
      if (owner !== undefined) plugins.set(owner.name, (plugins.get(owner.name) ?? 0) + tokens)
      continue
    }
    const old = connectors.get(conn.name)
    const plugin = hits.find(h => h.kind === 'plugin')?.name
    connectors.set(conn.name, { kind: 'connector', name: conn.name, tokens: (old?.tokens ?? 0) + tokens, ...(plugin === undefined ? {} : { plugin }) })
    if (plugin !== undefined) plugins.set(plugin, (plugins.get(plugin) ?? 0) + tokens)
  }

  return [
    ...skills.slice(0, MAX_INSTALLED),
    ...[...connectors.values()].slice(0, MAX_INSTALLED),
    ...[...plugins].slice(0, MAX_INSTALLED).map(([name, tokens]): InstalledItem => ({ kind: 'plugin', name, tokens })),
  ]
}

// How often an installed thing was used. A plugin's skill is recorded as `plugin:skill` (see
// skillHits), so it matches only that spelling; any other skill matches its own name.
export function usedCount(used: UsageItems, item: InstalledItem): number {
  const name = item.kind === 'skill' && item.plugin !== undefined && !item.name.includes(':') ? `${item.plugin}:${item.name}` : item.name

  return used[keyOf(item.kind, name)]?.n ?? 0
}

export const ofKind = (list: InstalledItem[], kind: UsageKind) => list.filter(x => x.kind === kind)

// "~340", "~1.2k"
export const tokenText = (n: number): string => (n < 1000 ? `~${n}` : `~${(n / 1000).toFixed(1)}k`)
