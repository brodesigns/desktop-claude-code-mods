export type Snippet = { id: number; title: string; lang: string; code: string; at: number; masked: number }
// The snippets of the project the session runs in.
export type SnippetLib = { root: string; project: string; key: string; list: Snippet[] }
export type SnippetNote = { text: string; tone: 'success' | 'warning' | 'error' }

declare module 'claude-code' {
  interface PluginState {
    'snippet-pane': {
      snippetLib: SnippetLib | null
      snippetOpen: number[]
      snippetNote: SnippetNote | null
      snippetNew: boolean
    }
  }
}
