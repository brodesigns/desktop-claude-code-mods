// One marker and how often it occurs in all scanned files.
export type TodoCount = { marker: string; n: number }

// What the band draws: counts per marker (only those above 0), the files holding any (relative, most first).
export type TodoSummary = { counts: TodoCount[]; files: string[]; fileCount: number }

declare module 'claude-code' {
  interface PluginState {
    'todo-band': { summary: TodoSummary | null }
  }
}
