export type UsageKind = 'skill' | 'plugin' | 'connector'

// One thing that was used: how often, when first and when last (epoch ms).
export type UsageEntry = { kind: UsageKind; name: string; n: number; first: number; last: number }

// Entries by `kind:name`.
export type UsageItems = Record<string, UsageEntry>

// Something installed: a skill (or command), a connector (MCP server) or a plugin.
// `tokens` is a rough estimate of what its names and descriptions add to every prompt.
export type InstalledItem = { kind: UsageKind; name: string; tokens: number; plugin?: string }

// What one built-in tool did: calls, failed calls, calls refused by a hook, total time (ms).
export type ToolStat = { name: string; n: number; failed: number; denied: number; ms: number }
export type ToolStats = Record<string, ToolStat>

declare module 'claude-code' {
  interface PluginState {
    'usage-pane': {
      // This session's counts.
      sessionItems: Shaped<UsageItems>
      // All sessions (a copy of the plugin store, loaded at session start).
      allItems: Shaped<UsageItems>
      // 'skill', 'plugin' or 'connector'
      usageTab: string
      // 'session' or 'all'
      usageScope: string
      // 'most' (most used first) or 'least' (least used and longest idle first)
      usageSort: string
      // 'used', 'unused', 'context' or 'tools'
      usageView: string
      // Everything installed, read from the engine (see the refresh button).
      installed: Shaped<InstalledItem[]>
      // Built-in tool statistics, this session and all sessions.
      sessionTools: Shaped<ToolStats>
      allTools: Shaped<ToolStats>
      // true while the "About these numbers" note is open
      usageInfo: boolean
      // true after the first press of "Reset all"
      usageConfirm: boolean
    }
  }
}
