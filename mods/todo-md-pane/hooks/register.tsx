import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { TodoItem, TodoList, TodoNote } from '../types'
import { isNarrow } from './layout'
import { actions, emptyState, legend, note, sectionTitle, SPACE, TYPE } from './style'
import { findName, parse, remove, restore } from './todo'

const PANE = 'todo-md-pane'
const POLL_MS = 5_000

const list = atom({ plugin: 'todo-md-pane', key: 'todoList' } as const, null)
const told = atom({ plugin: 'todo-md-pane', key: 'todoNote' } as const, null)
const undoable = atom({ plugin: 'todo-md-pane', key: 'todoUndo' } as const, null)

let timer: { cancel: () => void } | null = null
let busy = false

// Writes only when the value differs (JSON compare); every write redraws the pane.
async function setIfChanged<T>(get: () => Promise<T>, set: (value: T) => Promise<unknown>, value: T): Promise<boolean> {
  if (JSON.stringify(await get()) === JSON.stringify(value)) return false
  await set(value)

  return true
}

// The todo.md in the project root, or null. A missing folder or file reads as "none".
async function locate($: EngineInterface): Promise<{ path: string; name: string } | null> {
  try {
    const root = await $.session.root()
    const name = findName((await $.fs.list(root)).filter(f => f.kind === 'file').map(f => f.name))

    return name === null ? null : { path: `${root}/${name}`, name }
  } catch {
    return null
  }
}

// One look at the file. Never throws, never stacks: a look still running makes the next one a no-op.
async function refresh($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    const found = await locate($)
    let fresh: TodoList | null = null
    if (found !== null) {
      const text = await $.fs.read(found.path)
      fresh = { ...found, items: typeof text === 'string' ? parse(text) : [] }
    }
    await setIfChanged(() => read($, list), v => update($, list, () => v), fresh)
  } catch {
    // Unreadable this time; the next look tries again.
  } finally {
    busy = false
  }
}

async function say($: EngineInterface, text: string, tone: TodoNote['tone']) {
  await update($, told, () => ({ text, tone }))
}

// Ticking: read the file fresh, cut the entry out, write it back. The file is the truth, not the pane.
async function tick($: EngineInterface, item: TodoItem) {
  const data = await read($, list)
  if (data === null) return
  try {
    const text = await $.fs.read(data.path)
    const cut = typeof text === 'string' ? remove(text, item) : null
    if (cut === null) {
      await refresh($)
      return say($, `"${item.text}" is no longer in ${data.name}.`, 'warning')
    }
    await $.fs.write(data.path, cut.text)
    await update($, undoable, () => ({ path: data.path, index: cut.index, lines: cut.lines, text: item.text }))
    await refresh($)
    await say($, `"${item.text}" removed from ${data.name}.`, 'success')
  } catch {
    await say($, `Not removed: ${data.name} could not be written.`, 'error')
  }
}

async function undo($: EngineInterface) {
  const last = await read($, undoable)
  if (last === null) return
  try {
    const text = await $.fs.read(last.path)
    await $.fs.write(last.path, restore(typeof text === 'string' ? text : '', last.index, last.lines))
    await update($, undoable, () => null)
    await refresh($)
    await say($, `"${last.text}" is back.`, 'success')
  } catch {
    await say($, 'Not restored: the file could not be written.', 'error')
  }
}

async function start($: EngineInterface) {
  await refresh($)
  timer?.cancel()
  timer = $.clock.every(POLL_MS, () => void refresh($))
  // A project with a todo.md gets its pane without asking.
  if ((await read($, list)) !== null) await $.ui.open({ id: PANE, title: 'Todo' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'todolist', description: 'Open the pane with the open items of this project\'s todo.md' })
    await start($)

    return next(e)
  })

  on('command.run', { command: 'todolist' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Todo' })

    return { text: 'Todo pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => view($, e))
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const data = await read($, list)
  const message = await read($, told)
  const last = await read($, undoable)

  const open = data?.items.filter(i => !i.done) ?? []
  const doneCount = (data?.items.length ?? 0) - open.length

  // One row per entry, indented by its depth; a heading row whenever the section changes.
  const rows: unknown[] = []
  let section: string | null = null
  for (const item of open) {
    if (item.section !== section) {
      section = item.section
      if (section !== '') rows.push(sectionTitle(ui, `sec-${item.index}`, section))
    }
    rows.push(
      <Box key={`row-${item.index}`} marginLeft={item.depth > 0 ? 'md' : undefined} minWidth={0} overflow="hidden">
        <Button key={`item-${item.index}`} plain onPress={() => tick($, item)}>
          <Text size={TYPE.body}>{`☐ ${item.text}`}</Text>
        </Button>
      </Box>,
    )
  }

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={0}>
          <Text size={TYPE.heading} weight="semibold">Todo</Text>
        </Box>
        <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end">
          <Text dimColor size={TYPE.label} wrap="truncate">
            {data === null ? 'no todo.md' : `${data.name} · ${open.length} open`}
          </Text>
        </Box>
      </Box>

      {last !== null &&
        actions(ui, 'undo', [<Button key="undo" label={narrow ? '↶ undo' : `↶ undo "${last.text.slice(0, 40)}"`} variant="secondary" onPress={() => undo($)} />])}
      {message !== null && note(ui, 'note', message.text, message.tone)}

      {data === null && emptyState(ui, 'missing', '☐', 'No todo.md in the project folder. Create one with lines like "- [ ] task" and this pane fills itself.')}
      {data !== null && open.length === 0 && emptyState(ui, 'clear', '✓', doneCount > 0 ? `All done. ${doneCount} already ticked in the file.` : `${data.name} has no entries yet.`)}
      {rows as never}

      {data !== null && legend(ui, 'legend', 'Click an entry to tick it: its line (with sub-lines) is removed from the file. "undo" puts it back. Entries already marked [x] are not shown.')}
    </Box>
  )
}
