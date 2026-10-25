// The running summary: its bullet lines, how many turns it covers and the tokens the updates cost in all.
export type Summary = { text: string; turns: number; tokens: number }
export type SummaryNote = { text: string; tone: 'success' | 'warning' | 'error' }

declare module 'claude-code' {
  interface PluginState {
    'session-summary': {
      summary: Summary | null
      // Digests of finished turns the summary does not cover yet.
      waiting: string[]
      // The latest prompt and the files written since it: the next turn's digest is built from them.
      lastAsk: string
      lastFiles: string[]
      isBusy: boolean
      summaryNote: SummaryNote | null
      // The pane's switch for automatic updates; null: the setting `auto` applies.
      autoOn: boolean | null
    }
  }
}
