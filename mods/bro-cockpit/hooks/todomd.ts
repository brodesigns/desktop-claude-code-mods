import type { TodoItem } from '../types'

// Pure parsing and editing of a todo.md; no `$`, no state.

// `- [ ] text`, `* [x] text`, `1. [ ] text` and plain bullets `- text`. A line with a checkbox is an entry,
// a plain bullet too (a todo.md often has no boxes); a box with any mark but a space is done.
const ENTRY = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[(.)\]\s*)?(\S.*)?$/
const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/

const indentOf = (line: string) => (line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length
const clean = (line: string) => line.replace(/\r$/, '')

// The pane shows plain text: links keep their label, bold, italic, strikethrough and code lose their marks.
// Only the display text changes; `raw` stays the file's line, so ticking still finds it.
export const plain = (text: string): string =>
  text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])([*_])(\S(?:.*?\S)?)\2(?=[\s).,;:!?]|$)/g, '$1$3')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')

export const parse = (text: string): TodoItem[] => {
  const out: TodoItem[] = []
  let section = ''
  let inFence = false
  text.split('\n').forEach((raw, index) => {
    const line = clean(raw)
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) return
    const heading = line.match(HEADING)
    if (heading !== null) {
      section = heading[1] ?? ''
      return
    }
    const m = line.match(ENTRY)
    // A bare `- [ ]` or `-` has no text: nothing to show.
    if (m === null || (m[3] ?? '').trim() === '') return
    // `[ ]` is open; any other mark (`x`, `X`, `-`, `~`) is a finished or dropped entry.
    out.push({ index, raw: line, text: plain((m[3] ?? '').trim()), depth: Math.min(3, Math.floor(indentOf(line) / 2)), section, done: m[2] !== undefined && m[2] !== ' ' })
  })

  return out
}

// The lines that belong to the entry: itself and the indented lines directly below it (its sub-entries and notes).
const span = (lines: string[], at: number) => {
  const base = indentOf(clean(lines[at] ?? ''))
  let end = at + 1
  while (end < lines.length) {
    const line = clean(lines[end] ?? '')
    if (line.trim() === '' || indentOf(line) <= base) break
    end += 1
  }

  return end
}

// Where the entry sits now: at its line when that still reads the same, else the first line that does.
// The file may have changed since the pane drew it; a different line is never removed.
const locate = (lines: string[], item: Pick<TodoItem, 'index' | 'raw'>): number => {
  if (clean(lines[item.index] ?? '') === item.raw) return item.index

  return lines.findIndex(l => clean(l) === item.raw)
}

// Removes the entry with its sub-lines. `null` when the entry is no longer in the file.
export const remove = (text: string, item: Pick<TodoItem, 'index' | 'raw'>): { text: string; index: number; lines: string[] } | null => {
  const lines = text.split('\n')
  const at = locate(lines, item)
  if (at < 0) return null
  const end = span(lines, at)
  const removed = lines.slice(at, end)
  lines.splice(at, end - at)

  return { text: lines.join('\n'), index: at, lines: removed }
}

// Puts removed lines back at their line number (at the end when the file got shorter).
export const restore = (text: string, index: number, lines: string[]): string => {
  const all = text.split('\n')
  all.splice(Math.min(index, all.length), 0, ...lines)

  return all.join('\n')
}

// The file name in the root: `todo.md` in any capitalisation.
export const findName = (names: string[]): string | null => names.find(n => n.toLowerCase() === 'todo.md') ?? null

// The lines typed into the add field as entries: one per non-empty line, a leading bullet or box is dropped.
export const entriesFrom = (input: string): string[] =>
  input
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*+]|\d+[.)])?\s*(?:\[.\]\s*)?/, '').trim())
    .filter(l => l !== '')

// New entries at the end of the file, in its own line ending. A missing file starts with a heading.
export const append = (text: string | null, entries: readonly string[]): string => {
  const eol = text?.includes('\r\n') ? '\r\n' : '\n'
  const lines = entries.map(e => `- [ ] ${e}${eol}`).join('')
  if (text === null || text === '') return `# Todo${eol}${eol}${lines}`

  return `${text}${text.endsWith('\n') ? '' : eol}${lines}`
}
