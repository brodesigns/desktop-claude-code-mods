// One permission rule (as the engine suggests it, e.g. `Bash(git push:*)`) and what happened to its prompts.
export type RuleEntry = {
  rule: string
  tool: string
  asked: number
  allowed: number
  declined: number
  first: number
  last: number
  // A redacted one-line example of what was asked.
  example: string
}

// Entries by `r:rule`.
export type RuleMap = Record<string, RuleEntry>

declare module 'claude-code' {
  interface PluginState {
    'permission-log': {
      // This session's prompts.
      sessionRules: Shaped<RuleMap>
      // All sessions (a copy of the plugin store, loaded at session start).
      allRules: Shaped<RuleMap>
      // 'worth' (allowed often, never declined) or 'all'
      permView: string
      // 'session' or 'all'
      permScope: string
      // '' or the key of the open rule
      permOpen: string
      // true while the notes are open
      permInfo: boolean
      // true after the first press of "Reset all"
      permConfirm: boolean
      // What the last action did, shown as one line.
      permNote: { text: string; tone: 'success' | 'warning' | 'error' } | null
    }
  }
}
