// One rate-limit window as the band draws it; resetsAt in ms since the epoch, 0 when unknown.
export type LimitRow = { kind: string; percent: number; resetsAt: number }
// What the band reads: the windows over the threshold and the minute the countdown counts from.
export type LimitSnap = { at: number; rows: LimitRow[] }

declare module 'claude-code' {
  interface PluginState {
    'limit-band': { snap: LimitSnap | null }
  }
}
