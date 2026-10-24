// Today's figures over every session of the day; `commits` null when not counted (off, or no repository).
export type DayTotals = { date: string; ms: number; turns: number; usd: number; commits: number | null; sessions: number }

declare module 'claude-code' {
  interface PluginState {
    'daily-band': {
      today: DayTotals | null
      // The session's cost (USD) last counted; -1 before the first reading. Survives a reload.
      costSeen: number
      // Turn ids already counted, so a turn replayed after a lost worker is not counted twice.
      seenTurns: string[]
    }
  }
}
