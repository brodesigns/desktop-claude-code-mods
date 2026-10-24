// One output line: its text and whether it came from standard error.
export type LogLine = { t: string; err: boolean }

export type LogStatus = 'running' | 'ok' | 'error' | 'denied' | 'interrupted' | 'background'

// One Bash tool call. Command, note and lines are redacted before they are kept.
export type LogEntry = {
  id: string
  command: string
  startedAt: number
  ms: number
  status: LogStatus
  // null: not known (running, denied, background, or no "Exit code" in the error)
  exitCode: number | null
  note: string
  lines: LogLine[]
  // Lines left out: the head of a long output, or all of them once the entry is old.
  cut: number
  agent: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'log-viewer': {
      logList: Shaped<LogEntry[]>
      // 'all' or 'errors'
      logFilter: string
      logQuery: string
      // '' the newest entry is open, '-' none, else the id of the open entry
      logOpen: string
    }
  }
}
