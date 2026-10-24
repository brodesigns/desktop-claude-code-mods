// A project's deadline: when (ms since the epoch, local), what, and whether a time was given (else 23:59).
export type Deadline = { at: number; text: string; hasTime: boolean }
// The project the session is in, its store key, and its deadline if one is set.
export type DeadlineView = { key: string; project: string; deadline: Deadline | null }

declare module 'claude-code' {
  interface PluginState {
    'deadline-band': { current: DeadlineView | null; minute: number }
  }
}
