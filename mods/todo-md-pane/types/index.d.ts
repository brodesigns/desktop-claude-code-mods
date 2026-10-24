// One open or finished entry of the todo.md. `index` is its line in the file.
export type TodoItem = { index: number; raw: string; text: string; depth: number; section: string; done: boolean }
// What the pane shows: the file found in the project root and its entries.
export type TodoList = { path: string; name: string; items: TodoItem[] }
export type TodoNote = { text: string; tone: 'success' | 'warning' | 'error' }
// The last removal, so a tick can be taken back: the line number and the removed lines.
export type TodoUndo = { path: string; index: number; lines: string[]; text: string }

// One marker (TODO, FIXME ...) and how often it occurs in the scanned files.
export type TodoCount = { marker: string; n: number }
// Code markers: counts per marker (only above 0) and the files holding any (relative, most first).
export type TodoSummary = { counts: TodoCount[]; files: string[]; fileCount: number }

declare module 'claude-code' {
  interface PluginState {
    'todo-md-pane': {
      todoList: TodoList | null
      todoNote: TodoNote | null
      todoUndo: TodoUndo | null
      todoMarkers: TodoSummary | null
    }
  }
}
