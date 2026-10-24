import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { Board, Column, KanbanCard, KanbanNote } from '../types'
import { asCards, COLUMNS, inColumn, parseCards, splitDone, step } from './board'
import { redactCounted } from './keys'
import { columns, isNarrow, isWide } from './layout'
import { projectOf } from './project'
import { card, emptyState, note, SPACE, TYPE } from './style'

const PANE = 'kanban-pane'

const board = atom({ plugin: 'kanban-pane', key: 'kanbanBoard' } as const, null)
const showOld = atom({ plugin: 'kanban-pane', key: 'kanbanShowOld' } as const, false)
const lastNote = atom({ plugin: 'kanban-pane', key: 'kanbanNote' } as const, null)

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
  await update($, lastNote, () => ({ text, tone }))
}

// Adds each line as a card to Open; the answer says exactly what was kept.
async function add($: EngineInterface, args: string): Promise<{ text: string; tone: KanbanNote['tone'] }> {
  const texts = parseCards(args).map(redactCounted)
  if (texts.length === 0) return { text: 'Nothing saved: please give a text, e.g. /card Build the login page.', tone: 'error' }
  const now = await $.clock.now()
  const isSaved = await mutate($, cards => {
    const first = cards.reduce((max, c) => Math.max(max, c.id), 0) + 1

    return [...cards, ...texts.map((t, i) => ({ id: first + i, text: t.text, col: 'open' as const, at: now, movedAt: now }))]
  })
  if (!isSaved) return { text: 'Not saved: the plugin store refused the value (full or unreachable).', tone: 'error' }
  const project = (await read($, board))?.project ?? ''
  const masked = texts.reduce((n, t) => n + t.masked, 0)
  const head = texts.length === 1 ? `Card saved in Open (${project}).` : `${texts.length} cards saved in Open (${project}).`

  return masked > 0 ? { text: `${head} Warning: ${masked} ${masked === 1 ? 'place was' : 'places were'} redacted as a key.`, tone: 'warning' } : { text: head, tone: 'success' }
}

async function move($: EngineInterface, id: number, by: -1 | 1) {
  const now = await $.clock.now()
  const isSaved = await mutate($, cards =>
    cards.map(c => {
      const to = c.id === id ? step(c.col, by) : undefined

      return to === undefined ? c : { ...c, col: to, movedAt: now }
    }),
  )
  if (!isSaved) await say($, 'Not moved: the plugin store refused.', 'error')
}

async function remove($: EngineInterface, c: KanbanCard) {
  const isSaved = await mutate($, cards => cards.filter(one => one.id !== c.id))
  await say($, isSaved ? `Card "${c.text.slice(0, 40)}" deleted.` : 'Not deleted: the plugin store refused.', isSaved ? 'success' : 'error')
}

async function addFromPane($: EngineInterface, value: string) {
  const answer = await add($, value)
  await say($, answer.text, answer.tone)
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
    await ensure($)

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
  const wide = isWide(e)
  const data = await read($, board)
  const told = await read($, lastNote)
  const isOldShown = await read($, showOld)
  const now = await $.clock.now()

  if (data === null) return emptyState(ui, 'loading', '▦', 'Loading board …')

  // Side by side the columns share the width; stacked each takes all of it.
  const colWidth = wide ? Math.max(16, Math.floor((columns(e) - 4) / 3)) : undefined
  const done = splitDone(inColumn(data.cards, 'done'), now, doneDays)

  const cardView = (c: KanbanCard) => {
    const left = step(c.col, -1)
    const right = step(c.col, 1)
    const name = (col: Column) => COLUMNS.find(x => x.id === col)?.label ?? col

    return card(ui, `card-${c.id}`, 'neutral', [
      <Box key={`text-${c.id}`} minWidth={0} overflow="hidden">
        <Text size={TYPE.body} wrap="wrap" dimColor={c.col === 'done'}>{c.text}</Text>
      </Box>,
      <Box key={`act-${c.id}`} gap={SPACE.tight} flexWrap="wrap">
        {left !== undefined && <Button key={`left-${c.id}`} label={wide || narrow ? '‹' : `‹ ${name(left)}`} variant="secondary" onPress={() => move($, c.id, -1)} />}
        {right !== undefined && <Button key={`right-${c.id}`} label={wide || narrow ? '›' : `${name(right)} ›`} variant="secondary" onPress={() => move($, c.id, 1)} />}
        <Button key={`rm-${c.id}`} label="✕" variant="secondary" onPress={() => remove($, c)} />
      </Box>,
    ])
  }

  const columnView = (col: (typeof COLUMNS)[number]) => {
    const all = inColumn(data.cards, col.id)
    const shown = col.id === 'done' && !isOldShown ? done.recent : all

    return (
      <Box key={`col-${col.id}`} flexDirection="column" gap={SPACE.tight} width={colWidth} flexGrow={wide ? 1 : undefined} flexShrink={1} minWidth={0} overflow="hidden">
        <Box key={`head-${col.id}`} justifyContent="space-between" gap={SPACE.tight}>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text size={TYPE.body} weight="semibold" wrap="truncate">
              {col.mark} {col.label}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text dimColor size={TYPE.label} tabular>{String(all.length)}</Text>
          </Box>
        </Box>
        {all.length === 0 && <Text key={`none-${col.id}`} dimColor size={TYPE.label}>empty</Text>}
        {col.id === 'done' && done.old.length > 0 && (
          <Button
            key="old"
            label={isOldShown ? '▾ hide older' : `▸ ${done.old.length} older than ${doneDays} ${doneDays === 1 ? 'day' : 'days'}`}
            variant="secondary"
            onPress={() => update($, showOld, v => !v)}
          />
        )}
        {shown.map(cardView)}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={0}>
          <Text size={TYPE.heading} weight="semibold">Kanban</Text>
        </Box>
        <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end">
          <Text dimColor size={TYPE.label} wrap="truncate">▣ {data.project}</Text>
        </Box>
      </Box>

      {'Input' in ui ? (
        <ui.Input key="new-card" placeholder="New card for Open …" submitLabel="add" onSubmit={(v: string) => addFromPane($, v)} />
      ) : (
        <Text dimColor size={TYPE.label} wrap="wrap">{'No input field here: use /card <text>.'}</Text>
      )}
      {told !== null && note(ui, 'note', told.text, told.tone)}
      {data.cards.length === 0 && emptyState(ui, 'empty', '▦', `No cards for ${data.project} yet. /card <text> adds one to Open.`)}

      <Box key="columns" flexDirection={wide ? 'row' : 'column'} gap={wide ? SPACE.tight : SPACE.base} alignItems={wide ? 'flex-start' : 'stretch'}>
        {COLUMNS.map(columnView)}
      </Box>
    </Box>
  )
}
