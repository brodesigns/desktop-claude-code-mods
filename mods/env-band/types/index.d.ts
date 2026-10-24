// The band's colour: production is error, staging warning, everything else info.
export type EnvTone = 'error' | 'warning' | 'info'

// What the band draws: the environment's name ('' when no file names one) and the .env files in the root.
// Never a value other than the environment's name.
export type EnvInfo = { name: string; tone: EnvTone; files: string[] }

declare module 'claude-code' {
  interface PluginState {
    'env-band': { envInfo: EnvInfo | null }
  }
}
