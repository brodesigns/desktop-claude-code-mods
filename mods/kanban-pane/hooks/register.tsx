import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { Board, KanbanCard, KanbanNote } from '../types'
import { asCards, capDone, COLUMNS, inColumn, parseCards, splitDone, step } from './board'
import { redactCounted } from './keys'
import { isNarrow } from './layout'
import { projectOf } from './project'
import { setIfChanged } from './state'
import { actions, BRAND, emptyState, note, SPACE, TYPE } from './style'

const PANE = 'kanban-pane'

const board = atom({ plugin: 'kanban-pane', key: 'kanbanBoard' } as const, null)
const showOld = atom({ plugin: 'kanban-pane', key: 'kanbanShowOld' } as const, false)
const lastNote = atom({ plugin: 'kanban-pane', key: 'kanbanNote' } as const, null)
// Whether the field for a new card is open; closed, the pane is just the board.
const creating = atom({ plugin: 'kanban-pane', key: 'kanbanNew' } as const, false)
const openIds = atom({ plugin: 'kanban-pane', key: 'kanbanOpen' } as const, [])

// How long the note about the last action stays visible.
const NOTE_MS = 8000

// From userConfig; a reload brings a changed value.
let doneDays = 14

// Loads the project's board; again when the project root moved or `force` asks.
async function ensure($: EngineInterface, force = false): Promise<Board> {
  const root = await $.session.root()
  const current = await read($, board)
  if (!force && current !== null && current.root === root) return current
  const { project, key } = projectOf(root, 'kanban')
  const fresh: Board = { root, project, key, cards: asCards(await $.store.get(key)) }
  await update($, board, () => fresh)

  return fresh
}

// Read, change, write: the store first, so another session's cards are not overwritten. False when the store refused.
async function mutate($: EngineInterface, change: (cards: KanbanCard[]) => KanbanCard[]): Promise<boolean> {
  const loaded = await ensure($)
  const changed = change(asCards(await $.store.get(loaded.key)))
  try {
    await $.store.set(loaded.key, changed)
  } catch {
    return false
  }
  await update($, board, cur => (cur === null ? cur : { ...cur, cards: changed }))

  return true
}

async function say($: EngineInterface, text: string, tone: KanbanNote['tone']) {
  const at = await $.clock.now()
  await update($, lastNote, () => ({ text, tone, at }))
}

// Adds each line as a card to Open; the answer says exactly what was kept.
async function add($: EngineInterface, args: string): Promise<{ text: string; tone: KanbanNote['tone'] }> {
  const texts = parseCards(args).map(redactCounted)
  if (texts.length === 0) return { text: 'Nothing saved: please give a text, e.g. /card Build the login page.', tone: 'error' }
  const now = await $.clock.now()
  const isSaved = await mutate($, cards => {
    const first = cards.reduce((max, c) => Math.max(max, c.id), 0) + 1

    return capDone([...cards, ...texts.map((t, i) => ({ id: first + i, text: t.text, col: 'open' as const, at: now, movedAt: now }))])
  })
  if (!isSaved) return { text: 'Not saved: the plugin store refused the value (full or unreachable).', tone: 'error' }
  const project = (await read($, board))?.project ?? ''
  const masked = texts.reduce((n, t) => n + t.masked, 0)
  const head = texts.length === 1 ? `Card saved in Open (${project}).` : `${texts.length} cards saved in Open (${project}).`

  return masked > 0 ? { text: `${head} Warning: ${masked} ${masked === 1 ? 'place was' : 'places were'} redacted as a key.`, tone: 'warning' } : { text: head, tone: 'success' }
}

// Cards match by id and creation time: another session may have reused an id since this view was drawn.
const isSame = (a: KanbanCard, b: KanbanCard) => a.id === b.id && a.at === b.at

async function move($: EngineInterface, c: KanbanCard, by: -1 | 1) {
  const now = await $.clock.now()
  const isSaved = await mutate($, cards =>
    capDone(
      cards.map(one => {
        const to = isSame(one, c) ? step(one.col, by) : undefined

        return to === undefined ? one : { ...one, col: to, movedAt: now }
      }),
    ),
  )
  if (!isSaved) await say($, 'Not moved: the plugin store refused.', 'error')
}

async function remove($: EngineInterface, c: KanbanCard) {
  const isSaved = await mutate($, cards => cards.filter(one => !isSame(one, c)))
  await say($, isSaved ? `Card "${c.text.slice(0, 40)}" deleted.` : 'Not deleted: the plugin store refused.', isSaved ? 'success' : 'error')
}

async function addFromPane($: EngineInterface, value: string) {
  const answer = await add($, value)
  await say($, answer.text, answer.tone)
  if (answer.tone !== 'error') await update($, creating, () => false)
}

// Opens or closes the field for a new card; a note about an earlier action goes away.
async function toggleNew($: EngineInterface) {
  if ((await read($, lastNote)) !== null) await update($, lastNote, () => null)
  await update($, creating, v => !v)
}

// After a turn: the project may have moved, and another session may have changed the cards.
async function refresh($: EngineInterface) {
  const loaded = await ensure($)
  const cards = asCards(await $.store.get(loaded.key))
  await setIfChanged(
    async () => (await read($, board))?.cards ?? null,
    value => update($, board, cur => (cur === null || value === null ? cur : { ...cur, cards: value })),
    cards,
  )
}

export const register: Register = (on, options) => {
  const wanted = Number((options as Record<string, unknown>).doneDays ?? 14)
  doneDays = Number.isFinite(wanted) && wanted >= 0 ? wanted : 14

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'card', description: 'Add a card to Open on this project\'s board: /card <text> (one card per line)', argumentHint: '<text>' })
    await $.command.register({ name: 'kanban', description: 'Open the kanban board of this project' })
    await ensure($)

    return next(e)
  })

  // The project can move (/cd, a worktree): checked after each turn, loaded only when it changed.
  on('turn.complete', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'card' }, async ($, e) => ({ text: (await add($, e.args)).text }))

  on('command.run', { command: 'kanban' }, async $ => {
    await ensure($, true)
    await $.ui.open({ id: PANE, title: 'Kanban' })

    return { text: 'Kanban board opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => view($, e))
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const data = await read($, board)
  const told = await read($, lastNote)
  const isOldShown = await read($, showOld)
  const isCreating = await read($, creating)
  const open = await read($, openIds)
  const now = await $.clock.now()

  if (data === null) return emptyState(ui, 'loading', '▦', 'Loading board …')

  const done = splitDone(inColumn(data.cards, 'done'), now, doneDays)

  // One line per card: the text opens it, `›` moves it on. Full text, back and delete only when opened.
  const row = (c: KanbanCard) => {
    const isOpen = open.includes(c.id)
    const left = step(c.col, -1)
    const isLast = step(c.col, 1) === undefined

    return (
      <Box key={`card-${c.id}`} flexDirection="column" gap={SPACE.tight}>
        <Box alignItems="center" gap={SPACE.base}>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Button key={`open-${c.id}`} plain onPress={() => update($, openIds, ids => (ids.includes(c.id) ? ids.filter(i => i !== c.id) : [...ids, c.id]))}>
              <Text size={TYPE.body} dimColor={c.col === 'done'} wrap={isOpen ? 'wrap' : 'truncate'}>{`○ ${c.text}`}</Text>
            </Button>
          </Box>
          <Box flexShrink={0}>
            {isLast ? (
              <Text key={`ok-${c.id}`} size={TYPE.body} dimColor>✓</Text>
            ) : (
              <Button key={`fwd-${c.id}`} plain onPress={() => move($, c, 1)}>
                <Text size={TYPE.body} color={BRAND} weight="semibold">›</Text>
              </Button>
            )}
          </Box>
        </Box>
        {isOpen &&
          actions(ui, `act-${c.id}`, [
            left !== undefined && <Button key={`back-${c.id}`} label="‹ back" variant="secondary" onPress={() => move($, c, -1)} />,
            <Button key={`rm-${c.id}`} label="✕ delete" variant="secondary" onPress={() => remove($, c)} />,
          ])}
      </Box>
    )
  }

  // A section line (`○ Open  3`) and its cards, stacked.
  const section = (col: (typeof COLUMNS)[number]) => {
    const all = inColumn(data.cards, col.id)
    const shown = col.id === 'done' && !isOldShown ? done.recent : all

    return (
      <Box key={`col-${col.id}`} flexDirection="column" gap={SPACE.tight} minWidth={0} overflow="hidden">
        <Box marginTop="xs" gap={SPACE.base}>
          <Text size={TYPE.body} weight="semibold" wrap="truncate">{`${col.mark} ${col.label}`}</Text>
          <Text dimColor size={TYPE.label} tabular>{String(all.length)}</Text>
        </Box>
        {col.id === 'done' && done.old.length > 0 && (
          <Button
            key="old"
            label={isOldShown ? '▾ hide older' : `▸ ${done.old.length} older than ${doneDays} ${doneDays === 1 ? 'day' : 'days'}`}
            variant="secondary"
            onPress={() => update($, showOld, v => !v)}
          />
        )}
        {shown.map(row)}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={0}>
          <Text size={TYPE.title} weight="semibold">Board</Text>
        </Box>
        <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end" gap={SPACE.base}>
          <Text dimColor size={TYPE.label} wrap="truncate">{`▣ ${data.project} · ${data.cards.length}`}</Text>
          <Button key="new" plain onPress={() => toggleNew($)}>
            <Text size={TYPE.label} color={BRAND} weight="semibold">{isCreating ? '✕' : '＋ new'}</Text>
          </Button>
        </Box>
      </Box>

      {isCreating &&
        ('Input' in ui ? (
          <ui.Input key="new-card" placeholder="New card for Open …" submitLabel="add" onSubmit={(v: string) => addFromPane($, v)} />
        ) : (
          <Text dimColor size={TYPE.label} wrap="wrap">{'No input field here: use /card <text>.'}</Text>
        ))}
      {told !== null && now - told.at < NOTE_MS && note(ui, 'note', told.text, told.tone)}

      {data.cards.length === 0 ? emptyState(ui, 'empty', '▦', `No cards for ${data.project} yet. Tap "＋ new" or /card <text>.`) : COLUMNS.map(section)}
    </Box>
  )
}
