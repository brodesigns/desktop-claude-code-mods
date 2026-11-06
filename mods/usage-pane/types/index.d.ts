export type UsageKind = 'skill' | 'plugin' | 'connector'

// One thing that was used: how often, when first and when last (epoch ms).
export type UsageEntry = { kind: UsageKind; name: string; n: number; first: number; last: number }

// Entries by `kind:name`.
export type UsageItems = Record<string, UsageEntry>

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
      // true after the first press of "Reset all"
      usageConfirm: boolean
    }
  }
}
