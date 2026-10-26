import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { TodoItem, TodoList, TodoNote } from '../types'
import { refreshCounts } from './counts'
import { isNarrow } from './layout'
import { configure, isTrackingSession, scanMarkers, trackFile } from './markers'
import { label } from './markerscan'
import { revealTarget } from './open'
import { PANE } from './pane'
import { setIfChanged } from './state'
import { emptyState, legend, more, sectionTitle, SPACE, tile, tiles, toolbar, TYPE } from './style'
import { append, entriesFrom, findName, parse, remove, restore } from './todomd'

const list = atom({ plugin: 'bro-cockpit', key: 'todoList' } as const, null)
const told = atom({ plugin: 'bro-cockpit', key: 'todoNote' } as const, null)
const undoable = atom({ plugin: 'bro-cockpit', key: 'todoUndo' } as const, null)
const markers = atom({ plugin: 'bro-cockpit', key: 'todoMarkers' } as const, null)
const adding = atom({ plugin: 'bro-cockpit', key: 'todoAdding' } as const, false)

const POLL_MS = 5_000
// Code markers cost a git call and file reads: looked at less often.
const MARKER_POLL_MS = 30_000
const HITS_SHOWN = 15
// A todo.md with hundreds of lines draws the first of them; the rest is one line.
const ITEMS_SHOWN = 100

let timer: { cancel: () => void } | null = null
let markerTimer: { cancel: () => void } | null = null
let isBusy = false
let isScanning = false
let isDue = false
// What the last read of todo.md looked like (path, change time, size). An unchanged file is not read or parsed
// again; our own writes clear it, so a quick edit within the same timestamp is still read.
let seen = ''
// Tick, add and undo each read, change and write the file: one after another, so none loses another's change.
let queue: Promise<unknown> = Promise.resolve()

function serial(job: () => Promise<void>): Promise<void> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)

  return run
}

// The pane is what shows these numbers; with it closed the polls rest. A failed look counts as open.
async function isPaneUp($: EngineInterface) {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
  } catch {
    return true
  }
}

// The todo.md in the project root, or null. A missing folder or file reads as "none".
async function locate($: EngineInterface): Promise<{ path: string; name: string; mtimeMs: number; size: number; isLink: boolean } | null> {
  try {
    const root = await $.session.root()
    const files = (await $.fs.list(root)).filter(f => f.kind === 'file' || (f.kind === 'other' && f.isLink))
    const name = findName(files.map(f => f.name))
    const entry = files.find(f => f.name === name)

    return name === null || entry === undefined ? null : { path: `${root}/${name}`, name, mtimeMs: entry.mtimeMs, size: entry.size, isLink: entry.isLink }
  } catch {
    return null
  }
}

// One look at the file. Never throws, never stacks: a look still running makes the next one a no-op.
export async function refreshTodo($: EngineInterface) {
  if (isBusy) return
  isBusy = true
  try {
    const found = await locate($)
    let fresh: TodoList | null = null
    let stamp = ''
    if (found !== null) {
      stamp = `${found.path}\n${found.mtimeMs}\n${found.size}`
      if (stamp === seen) return
      const text = await $.fs.read(found.path)
      fresh = { path: found.path, name: found.name, items: typeof text === 'string' ? parse(text) : [] }
    }
    await setIfChanged(() => read($, list), v => update($, list, () => v), fresh)
    seen = stamp
    await refreshCounts($)
  } catch {
    // Unreadable this time; the next look tries again.
  } finally {
    isBusy = false
  }
}

// One marker scan at a time; a request while one runs makes it go round once more.
async function refreshMarkers($: EngineInterface) {
  if (isScanning) {
    isDue = true
    return
  }
  isScanning = true
  try {
    do {
      isDue = false
      const fresh = await scanMarkers($)
      await setIfChanged(() => read($, markers), v => update($, markers, () => v), fresh)
      await refreshCounts($)
    } while (isDue)
  } catch {
    // Nothing to show this round; the next poll tries again.
  } finally {
    isScanning = false
  }
}

async function say($: EngineInterface, text: string, tone: TodoNote['tone']) {
  await update($, told, () => ({ text, tone }))
}

// Ticking: read the file fresh, cut the entry out, write it back. The file is the truth, not the pane.
async function tick($: EngineInterface, item: TodoItem) {
  await serial(() => tickNow($, item))
}

// A todo.md that is a symbolic link is shown but never written: the link could lead out of the project.
async function isLinked($: EngineInterface): Promise<boolean> {
  const found = await locate($)
  if (found === null || !found.isLink) return false
  await say($, `${found.name} is a symbolic link: it is shown, but never changed from here.`, 'warning')

  return true
}

async function tickNow($: EngineInterface, item: TodoItem) {
  const data = await read($, list)
  if (data === null || (await isLinked($))) return
  try {
    const text = await $.fs.read(data.path)
    const cut = typeof text === 'string' ? remove(text, item) : null
    if (cut === null) {
      seen = ''
      await refreshTodo($)
      return say($, `"${item.text}" is no longer in ${data.name}.`, 'warning')
    }
    seen = ''
    await $.fs.write(data.path, cut.text)
    await update($, undoable, () => ({ path: data.path, index: cut.index, lines: cut.lines, text: item.text }))
    await refreshTodo($)
    await say($, `"${item.text}" removed from ${data.name}.`, 'success')
  } catch {
    await say($, `Not removed: ${data.name} could not be written.`, 'error')
  }
}

// Adding: the typed lines go to the end of todo.md; without a file, one is created in the project root.
async function addEntries($: EngineInterface, input: string) {
  if (entriesFrom(input).length === 0) return
  await serial(() => addNow($, input))
}

async function addNow($: EngineInterface, input: string) {
  const entries = entriesFrom(input)
  try {
    const found = await locate($)
    if (found?.isLink === true) return say($, `${found.name} is a symbolic link: it is shown, but never changed from here.`, 'warning')
    const path = found?.path ?? `${await $.session.root()}/todo.md`
    const name = found?.name ?? 'todo.md'
    const before = found === null ? null : await $.fs.read(path)
    seen = ''
    await $.fs.write(path, append(typeof before === 'string' ? before : null, entries))
    await refreshTodo($)
    await say($, `${entries.length === 1 ? 'Added' : `Added ${entries.length} entries`} to ${name}${found === null ? ' (new file)' : ''}.`, 'success')
  } catch {
    await say($, 'Not added: the todo.md could not be written.', 'error')
  }
}

// The button: look at the file and the code markers now instead of at the next poll.
async function refreshNow($: EngineInterface) {
  await refreshTodo($)
  await refreshMarkers($)
}

async function undo($: EngineInterface) {
  await serial(() => undoNow($))
}

async function undoNow($: EngineInterface) {
  const last = await read($, undoable)
  if (last === null || (await isLinked($))) return
  try {
    const text = await $.fs.read(last.path)
    seen = ''
    await $.fs.write(last.path, restore(typeof text === 'string' ? text : '', last.index, last.lines))
    await update($, undoable, () => null)
    await refreshTodo($)
    await say($, `"${last.text}" is back.`, 'success')
  } catch {
    await say($, 'Not restored: the file could not be written.', 'error')
  }
}

// The cockpit's session.start calls this: settings, a first look, and the two polls (which rest while the pane
// is closed; opening it with /cockpit looks once at once).
export async function startTodo($: EngineInterface, markerWords: string, sessionFiles: boolean) {
  configure(markerWords, sessionFiles)
  timer?.cancel()
  timer = $.clock.every(POLL_MS, async () => {
    if (await isPaneUp($)) await refreshTodo($)
  })
  markerTimer?.cancel()
  markerTimer = $.clock.every(MARKER_POLL_MS, async () => {
    if (await isPaneUp($)) await refreshMarkers($)
  })
  void refreshTodo($)
  void refreshMarkers($)
}

// A file Claude wrote counts at once instead of at the next poll. Display only: the call already ran.
// The caller does not wait for it (`git grep` over the project must not delay the tool result) and it never throws.
export async function todoTouched($: EngineInterface, e: unknown, ran: { deny?: unknown; isError?: boolean }) {
  try {
    const tool = (e as { tool?: string }).tool ?? ''
    if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) || ran.deny !== undefined || ran.isError === true) return
    if (isTrackingSession()) await trackFile($, e)
    if (!(await isPaneUp($))) return
    await refreshTodo($)
    await refreshMarkers($)
  } catch {
    // Display only; the next poll looks again.
  }
}

// `/cockpit` opened the pane: look once now, the polls rested while it was closed.
export async function todoOpened($: EngineInterface) {
  try {
    await refreshNow($)
  } catch {
    // The next poll looks again.
  }
}

// The tab: the open entries of todo.md, then the markers found in changed code.
export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const data = await read($, list)
  const code = await read($, markers)
  const message = await read($, told)
  const last = await read($, undoable)
  const isAdding = await read($, adding)

  const open = data?.items.filter(i => !i.done) ?? []
  const doneCount = (data?.items.length ?? 0) - open.length
  const codeTotal = code?.counts.reduce((sum, c) => sum + c.n, 0) ?? 0

  // One row per entry, indented by its depth; a heading row whenever the section changes.
  const rows: unknown[] = []
  let section: string | null = null
  for (const item of open.slice(0, ITEMS_SHOWN)) {
    if (item.section !== section) {
      section = item.section
      if (section !== '') rows.push(sectionTitle(ui, `sec-${item.index}`, section))
    }
    rows.push(
      <Box key={`row-${item.index}`} marginLeft={item.depth > 0 ? 'md' : undefined} minWidth={0} overflow="hidden">
        <Button key={`item-${item.index}`} plain onPress={() => tick($, item)}>
          <Text size={TYPE.body} wrap="truncate">{`☐ ${item.text}`}</Text>
        </Button>
      </Box>,
    )
  }

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {tiles(ui, 'todo-tiles', [tile(ui, `${open.length}`, 'open', open.length > 0 ? 'warning' : 'neutral', data === null ? 'no todo.md' : data.name), tile(ui, `${codeTotal}`, 'in code', codeTotal > 0 ? 'warning' : 'neutral', code === null ? 'none found' : `${code.fileCount} ${code.fileCount === 1 ? 'file' : 'files'}`)])}

      {toolbar(
        ui,
        'todo-bar',
        [
          <Button key="add" label={isAdding ? '✕ close' : '＋ add'} variant={isAdding ? 'secondary' : 'primary'} onPress={() => update($, adding, v => !v)} />,
          <Button key="refresh" label="↻" variant="secondary" onPress={() => refreshNow($)} />,
        ],
        last !== null ? [<Button key="undo" label={narrow ? '↶ undo' : `↶ undo "${last.text.slice(0, 30)}"`} variant="secondary" onPress={() => undo($)} />] : undefined,
      )}
      {isAdding &&
        ('Input' in ui ? (
          <ui.Input key="todo-add" placeholder={data === null ? 'First entry (creates todo.md)' : 'New entry, one per line'} submitLabel="add" rows={narrow ? 2 : 3} onSubmit={(v: string) => addEntries($, v)} />
        ) : (
          <Text dimColor size={TYPE.label} wrap="wrap">No input field here: add the line to todo.md yourself.</Text>
        ))}
      {message !== null && <Text key="todo-note" dimColor size={TYPE.label} wrap="wrap">{message.text}</Text>}

      {data === null && emptyState(ui, 'todo-missing', '☐', 'No todo.md in the project folder. Tap "＋ add" to create one, or write lines like "- [ ] task" yourself.')}
      {data !== null && open.length === 0 && emptyState(ui, 'todo-clear', '✓', doneCount > 0 ? `All done. ${doneCount} already ticked in the file.` : `${data.name} has no entries yet.`, 'success')}
      {rows as never}
      {more(ui, 'todo-more', open.length - ITEMS_SHOWN, 'more entries in the file')}

      {code !== null && sectionTitle(ui, 'sec-code', 'In code', <Text dimColor size={TYPE.label}>{label(code).replace('☐ ', '')}</Text>)}
      {code !== null &&
        code.hits.slice(0, HITS_SHOWN).map(hit => (
          <Box key={`hit-${hit.file}:${hit.line}`} minWidth={0} overflow="hidden">
            <Button key={`file-${hit.file}:${hit.line}`} plain onPress={() => void revealTarget($, `${code.root}/${hit.file}`)}>
              <Text size={TYPE.label} wrap="truncate">
                {`▸ ${hit.file}:${hit.line}`}
                <Text dimColor>{`  ${hit.text}`}</Text>
              </Text>
            </Button>
          </Box>
        ))}
      {code !== null && more(ui, 'code-more', codeTotal - Math.min(HITS_SHOWN, code.hits.length), 'more in the project')}

      {data !== null && legend(ui, 'todo-legend', 'Click an entry to tick it: its line (with sub-lines) is removed from the file, "undo" puts it back. Entries already marked [x] are not shown. A hit under "In code" shows its file in the file manager.')}
    </Box>
  )
}
