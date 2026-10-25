export type PromptScope = 'global' | 'project'
export type Prompt = { id: string; name: string; text: string; at: number }
// What the pane shows: the global prompts and the ones of the project the session runs in.
export type PromptLib = { root: string; project: string; key: string; global: Prompt[]; local: Prompt[] }
// `at` is the clock time the note was made; the pane shows it for a few seconds only.
export type PromptNote = { text: string; tone: 'success' | 'warning' | 'error'; at: number }

declare module 'claude-code' {
  interface PluginState {
    'prompt-library': {
      promptLib: PromptLib | null
      promptQuery: string
      promptOpen: string
      promptNote: PromptNote | null
      promptValues: Record<string, string>
      promptScope: PromptScope
      promptNew: boolean
    }
  }
}
