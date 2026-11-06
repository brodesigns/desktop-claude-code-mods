import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { Snippet, SnippetLib, SnippetNote } from '../types'
import { redactCounted } from './keys'
import { isNarrow } from './layout'
import { projectOf } from './project'
import { asList, lineCount, parseSnippet } from './snippets'
import { actions, emptyState, note, SPACE, TYPE } from './style'

const PANE = 'snippet-pane'

const lib = atom({ plugin: 'snippet-pane', key: 'snippetLib' } as const, null)
const openIds = atom({ plugin: 'snippet-pane', key: 'snippetOpen' } as const, [])
const lastNote = atom({ plugin: 'snippet-pane', key: 'snippetNote' } as const, null)
// Whether the field for a new snippet is open; closed, the pane is just the list.
const creating = atom({ plugin: 'snippet-pane', key: 'snippetNew' } as const, false)

// Loads the project's snippets; again when the project root moved or `force` asks.
async function ensure($: EngineInterface, force = false): Promise<SnippetLib> {
  const root = await $.session.root()
  const current = await read($, lib)
  if (!force && current !== null && current.root === root) return current
  const { project, key } = projectOf(root, 'snippets')
  const fresh: SnippetLib = { root, project, key, list: asList(await $.store.get(key)) }
  await update($, lib, () => fresh)

  return fresh
}

// Another session may have added or deleted snippets: re-read the store and update the atom only when the list differs.
async function refresh($: EngineInterface) {
  const loaded = await ensure($)
  const list = asList(await $.store.get(loaded.key))
  if (JSON.stringify(list) !== JSON.stringify(loaded.list)) await update($, lib, cur => (cur === null ? cur : { ...cur, list }))
}

// Read, change, write: the store first, so another session's snippets are not overwritten. False when the store refused.
async function mutate($: EngineInterface, change: (list: Snippet[]) => Snippet[]): Promise<boolean> {
  const loaded = await ensure($)
  const changed = change(asList(await $.store.get(loaded.key)))
  try {
    await $.store.set(loaded.key, changed)
  } catch {
    return false
  }
  await update($, lib, cur => (cur === null ? cur : { ...cur, list: changed }))

  return true
}

// A note shows for this long, then the pane stops drawing it (it is checked when the pane draws).
const NOTE_MS = 8000

async function say($: EngineInterface, text: string, tone: SnippetNote['tone']) {
  const at = await $.clock.now()
  await update($, lastNote, () => ({ text, tone, at }))
}

const SYNTAX = 'Please write it like this: /snippet <title> and the code from the next line on, or /snippet <title> | <code>.'

// Saves from the command or the pane's field; secrets are masked first and the answer says so.
async function save($: EngineInterface, args: string): Promise<{ text: string; tone: SnippetNote['tone'] }> {
  const parsed = parseSnippet(args)
  if ('error' in parsed) return { text: `Not saved: ${parsed.error === 'code' ? 'The code is missing. ' : ''}${SYNTAX}`, tone: 'error' }
  const code = redactCounted(parsed.code)
  const title = redactCounted(parsed.title)
  const masked = code.masked + title.masked
  const at = await $.clock.now()
  let id = 0
  const isSaved = await mutate($, list => {
    id = list.reduce((max, s) => Math.max(max, s.id), 0) + 1

    return [...list, { id, title: title.text, lang: parsed.lang, code: code.text, at, masked }]
  })
  if (!isSaved) return { text: 'Not saved: the plugin store refused the value (full or unreachable).', tone: 'error' }
  const project = (await read($, lib))?.project ?? ''
  const lines = lineCount(code.text)
  const head = `Snippet "${title.text}" saved (${parsed.lang}, ${lines} ${lines === 1 ? 'line' : 'lines'}) for ${project}.`
  if (masked === 0) return { text: head, tone: 'success' }

  return { text: `${head} Warning: ${masked} ${masked === 1 ? 'place looked' : 'places looked'} like a key and ${masked === 1 ? 'was' : 'were'} redacted.`, tone: 'warning' }
}

// The fence is longer than any run of backticks in the code, so a snippet that holds ``` stays one block.
const fenced = (s: Snippet) => {
  const longest = Math.max(0, ...(s.code.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))

  return `${fence}${s.lang === 'text' ? '' : s.lang}\n${s.code}\n${fence}\n`
}

// "insert": at the caret in the prompt box, as a fenced block; else the clipboard; else the code opens to copy.
async function insert($: EngineInterface, s: Snippet, surface: RenderSurface) {
  const box = await $.prompt.fill({ text: fenced(s), mode: 'insert' })
  if (box.isFilled) return say($, `"${s.title}" is in the prompt box.`, 'success')
  const copied = await $.ui.copy({ text: s.code, surface })
  if (copied.isCopied) return say($, 'Prompt box unreachable. The code is on the clipboard.', 'warning')
  await update($, openIds, ids => (ids.includes(s.id) ? ids : [...ids, s.id]))
  await say($, 'Prompt box and clipboard unreachable: select and copy the code below.', 'error')
}

async function copy($: EngineInterface, s: Snippet, surface: RenderSurface) {
  const copied = await $.ui.copy({ text: s.code, surface })
  if (copied.isCopied) return say($, `"${s.title}" is on the clipboard.`, 'success')
  await update($, openIds, ids => (ids.includes(s.id) ? ids : [...ids, s.id]))
  await say($, 'Clipboard unreachable: select and copy the code below.', 'error')
}

async function remove($: EngineInterface, s: Snippet) {
  const isSaved = await mutate($, list => list.filter(one => !(one.id === s.id && one.at === s.at)))
  await say($, isSaved ? `"${s.title}" deleted.` : 'Not deleted: the plugin store refused.', isSaved ? 'success' : 'error')
}

async function saveFromPane($: EngineInterface, value: string) {
  const answer = await save($, value)
  await say($, answer.text, answer.tone)
  // Saved (success or warning): the field closes, so the typed text cannot be saved twice.
  if (answer.tone !== 'error') await update($, creating, () => false)
}

// Opens or closes the field; an old note goes away with it.
async function toggleNew($: EngineInterface) {
  await update($, creating, v => !v)
  if ((await read($, lastNote)) !== null) await update($, lastNote, () => null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'snippet', description: 'Save a code snippet for this project: /snippet <title> then the code on the next lines, or /snippet <title> | <code>', argumentHint: '<title> | <code>' })
    await $.command.register({ name: 'snippets', description: 'Open the snippet pane of this project' })
    await ensure($)

    return next(e)
  })

  // The project can move (/cd, a worktree) and other sessions change the list: checked after each turn.
  on('turn.complete', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'snippet' }, async ($, e) => ({ text: (await save($, e.args)).text }))

  on('command.run', { command: 'snippets' }, async $ => {
    await ensure($, true)
    await $.ui.open({ id: PANE, title: 'Snippets' })

    return { text: 'Snippets opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => view($, e))
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const data = await read($, lib)
  const open = await read($, openIds)
  const told = await read($, lastNote)
  const now = await $.clock.now()
  const isCreating = await read($, creating)

  if (data === null) return emptyState(ui, 'loading', '⌗', 'Loading snippets …')

  // One line per snippet: the title opens it, `↳` inserts it. Code, copy and delete only when opened.
  const row = (s: Snippet) => {
    const isOpen = open.includes(s.id)
    const total = lineCount(s.code)

    return (
      <Box key={`snip-${s.id}`} flexDirection="column" gap={SPACE.tight}>
        <Box alignItems="center" gap={SPACE.base}>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Button key={`open-${s.id}`} plain onPress={() => update($, openIds, ids => (ids.includes(s.id) ? ids.filter(i => i !== s.id) : [...ids, s.id]))}>
              <Text size={TYPE.body} wrap="truncate">{`${isOpen ? '▾' : '▸'} ${s.title}`}</Text>
              <Text size={TYPE.label} dimColor>{`  ${s.lang}${s.masked > 0 ? ' ⚠' : ''}`}</Text>
            </Button>
          </Box>
          <Box flexShrink={0}>
            <Button key={`ins-${s.id}`} plain onPress={press => insert($, s, press.surface)}>
              <Text size={TYPE.body} color="#39639E" weight="semibold">↳</Text>
            </Button>
          </Box>
        </Box>
        {isOpen && (
          <Box key={`body-${s.id}`} flexDirection="column" gap={SPACE.tight} marginLeft="md" minWidth={0} overflow="hidden">
            <Text mono size={TYPE.label} wrap="wrap">{s.code}</Text>
            {actions(ui, `act-${s.id}`, [
              <Button key={`copy-${s.id}`} label="⧉ copy" variant="secondary" onPress={press => copy($, s, press.surface)} />,
              <Button key={`rm-${s.id}`} label="✕ delete" variant="secondary" onPress={() => remove($, s)} />,
            ])}
            <Text dimColor size={TYPE.label}>{`${total} ${total === 1 ? 'line' : 'lines'}${s.masked > 0 ? ' · keys redacted' : ''}`}</Text>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={0}>
          <Text size={TYPE.title} weight="semibold">Snippets</Text>
        </Box>
        <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end" gap={SPACE.base}>
          <Text dimColor size={TYPE.label} wrap="truncate">{`▣ ${data.project} · ${data.list.length}`}</Text>
          <Button key="new" plain onPress={() => toggleNew($)}>
            <Text size={TYPE.label} color="#39639E" weight="semibold">{isCreating ? '✕' : '＋ new'}</Text>
          </Button>
        </Box>
      </Box>

      {isCreating &&
        ('Input' in ui ? (
          <ui.Input key="new-input" placeholder="Title on the first line, code below (or: title | code)" submitLabel="save" rows={narrow ? 4 : 6} onSubmit={(v: string) => saveFromPane($, v)} />
        ) : (
          <Text dimColor size={TYPE.label} wrap="wrap">{'No input field here: use /snippet <title> | <code>.'}</Text>
        ))}
      {told !== null && now - told.at < NOTE_MS && note(ui, 'note', told.text, told.tone)}

      {data.list.length === 0 && emptyState(ui, 'empty', '⌗', `No snippets for ${data.project} yet. Tap "＋ new" or /snippet <title> | <code>.`)}
      {data.list.map(row)}
    </Box>
  )
}
