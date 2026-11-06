import type { Column, KanbanCard } from '../types'

export const TEXT_MAX = 300
export const DAY_MS = 86_400_000
export const DONE_MAX = 200
// Cards drawn per column before a "+N more" row; the rest stays in the store.
export const COLUMN_CAP = 30

export const COLUMNS: readonly { id: Column; label: string; mark: string }[] = [
  { id: 'open', label: 'Open', mark: '○' },
  { id: 'doing', label: 'In progress', mark: '◐' },
  { id: 'done', label: 'Done', mark: '✓' },
]

const ORDER: Column[] = COLUMNS.map(c => c.id)

// One card per non-empty line, each cut to TEXT_MAX.
export const parseCards = (args: string): string[] =>
  args
    .split('\n')
    .map(l => l.trim().replace(/^[-*•]\s+/, ''))
    .filter(l => l !== '')
    .map(l => l.slice(0, TEXT_MAX))

// The column one step to the left (-1) or right (+1), or undefined at the edge.
export const step = (col: Column, by: -1 | 1): Column | undefined => ORDER[ORDER.indexOf(col) + by]

// Whatever the store holds, only well-formed cards come back.
export const asCards = (value: unknown): KanbanCard[] =>
  Array.isArray(value)
    ? value.filter(
        (c): c is KanbanCard =>
          typeof c === 'object' && c !== null && typeof c.id === 'number' && typeof c.text === 'string' && ORDER.includes(c.col) && typeof c.movedAt === 'number',
      )
    : []

// A column's cards, the latest arrival at the bottom.
export const inColumn = (cards: KanbanCard[], col: Column) => cards.filter(c => c.col === col).sort((a, b) => a.movedAt - b.movedAt || a.id - b.id)

// Done cards older than `days` are folded away; the rest stays in view.
export const splitDone = (done: KanbanCard[], now: number, days: number) => {
  const edge = now - days * DAY_MS

  return { recent: done.filter(c => c.movedAt >= edge), old: done.filter(c => c.movedAt < edge) }
}

// Keeps at most `max` Done cards: the ones that arrived there longest ago go first.
export const capDone = (cards: KanbanCard[], max = DONE_MAX): KanbanCard[] => {
  const done = cards.filter(c => c.col === 'done')
  if (done.length <= max) return cards
  const drop = new Set(done.sort((a, b) => a.movedAt - b.movedAt || a.id - b.id).slice(0, done.length - max))

  return cards.filter(c => !drop.has(c))
}
