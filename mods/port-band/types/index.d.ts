// One listening TCP port: its number, the process name (empty when not ours) and its pid (0 when unknown).
export type Listener = { port: number; name: string; pid: number }

declare module 'claude-code' {
  interface PluginState {
    'port-band': {
      // null: no tool found (lsof, ss) or not polled yet; the band then hides.
      portList: Listener[] | null
    }
  }
}
