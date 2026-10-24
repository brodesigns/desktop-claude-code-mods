export type Column = 'open' | 'doing' | 'done'
export type KanbanCard = { id: number; text: string; col: Column; at: number; movedAt: number }
// The board of the project the session runs in.
export type Board = { root: string; project: string; key: string; cards: KanbanCard[] }
export type KanbanNote = { text: string; tone: 'success' | 'warning' | 'error' }

declare module 'claude-code' {
  interface PluginState {
    'kanban-pane': {
      kanbanBoard: Board | null
      kanbanShowOld: boolean
      kanbanNote: KanbanNote | null
    }
  }
}
