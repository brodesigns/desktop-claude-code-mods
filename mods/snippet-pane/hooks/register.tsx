import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { Snippet, SnippetLib, SnippetNote } from '../types'
import { redactCounted } from './keys'
import { isNarrow } from './layout'
import { projectOf } from './project'
import { asList, lineCount, parseSnippet, preview } from './snippets'
import { actions, card, cardHead, chip, emptyState, legend, note, sectionTitle, SPACE, TYPE } from './style'

const PANE = 'snippet-pane'

const lib = atom({ plugin: 'snippet-pane', key: 'snippetLib' } as const, null)
const openIds = atom({ plugin: 'snippet-pane', key: 'snippetOpen' } as const, [])
const lastNote = atom({ plugin: 'snippet-pane', key: 'snippetNote' } as const, null)
const langFilter = atom({ plugin: 'snippet-pane', key: 'snippetLang' } as const, '')

// From userConfig; a reload brings a changed value.
let previewLines = 4

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

async function say($: EngineInterface, text: string, tone: SnippetNote['tone']) {
  await update($, lastNote, () => ({ text, tone }))
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

const fenced = (s: Snippet) => `\`\`\`${s.lang === 'text' ? '' : s.lang}\n${s.code}\n\`\`\`\n`

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
  const isSaved = await mutate($, list => list.filter(one => one.id !== s.id))
  await say($, isSaved ? `"${s.title}" deleted.` : 'Not deleted: the plugin store refused.', isSaved ? 'success' : 'error')
}

async function saveFromPane($: EngineInterface, value: string) {
  const answer = await save($, value)
  await say($, answer.text, answer.tone)
}

export const register: Register = (on, options) => {
  const wanted = Number((options as Record<string, unknown>).previewLines ?? 4)
  previewLines = Number.isFinite(wanted) ? Math.min(30, Math.max(1, Math.round(wanted))) : 4

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'snippet', description: 'Save a code snippet for this project: /snippet <title> then the code on the next lines, or /snippet <title> | <code>', argumentHint: '<title> | <code>' })
    await $.command.register({ name: 'snippets', description: 'Open the snippet pane of this project' })
    await ensure($)

    return next(e)
  })

  // The project can move (/cd, a worktree): checked after each turn, loaded only when it changed.
  on('turn.complete', async ($, e, next) => {
    await ensure($)

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
  const { Box, Button, Code, Text } = ui
  const narrow = isNarrow(e)
  const data = await read($, lib)
  const open = await read($, openIds)
  const told = await read($, lastNote)
  const filter = await read($, langFilter)

  if (data === null) return emptyState(ui, 'loading', '⌗', 'Loading snippets …')

  const langs = [...new Set(data.list.map(s => s.lang))]
  const shown = filter === '' || !langs.includes(filter) ? data.list : data.list.filter(s => s.lang === filter)

  const row = (s: Snippet) => {
    const isOpen = open.includes(s.id)
    const total = lineCount(s.code)
    const hidden = isOpen ? 0 : Math.max(0, total - previewLines)

    return card(ui, `card-${s.id}`, s.masked > 0 ? 'warning' : 'neutral', [
      cardHead(
        ui,
        `head-${s.id}`,
        s.title,
        <Box key={`tags-${s.id}`} gap={SPACE.tight}>
          {s.masked > 0 && chip(ui, `masked-${s.id}`, narrow ? '⚠' : '⚠ redacted', 'warning')}
          {chip(ui, `lang-${s.id}`, s.lang, 'info')}
        </Box>,
      ),
      <Box key={`code-${s.id}`} minWidth={0} overflow="hidden">
        <Code source={isOpen ? s.code : preview(s.code, previewLines)} language={s.lang === 'text' ? undefined : s.lang} wrap={isOpen ? 'wrap' : 'truncate-end'} />
      </Box>,
      hidden > 0 ? (
        <Text key={`hidden-${s.id}`} dimColor size={TYPE.label}>
          … {hidden} {hidden === 1 ? 'more line' : 'more lines'}
        </Text>
      ) : null,
      actions(ui, `act-${s.id}`, [
        <Button key={`ins-${s.id}`} label="↳ insert" variant="primary" onPress={press => insert($, s, press.surface)} />,
        total > previewLines ? (
          <Button key={`more-${s.id}`} label={isOpen ? '▾ less' : narrow ? '▸ all' : `▸ all ${total} lines`} variant="secondary" onPress={() => update($, openIds, ids => (ids.includes(s.id) ? ids.filter(i => i !== s.id) : [...ids, s.id]))} />
        ) : null,
        <Button key={`copy-${s.id}`} label="⧉ copy" variant="secondary" onPress={press => copy($, s, press.surface)} />,
        <Button key={`rm-${s.id}`} label="✕ delete" variant="secondary" onPress={() => remove($, s)} />,
      ]),
    ])
  }

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={0}>
          <Text size={TYPE.heading} weight="semibold">Snippets</Text>
        </Box>
        <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end">
          <Text dimColor size={TYPE.label} wrap="truncate">
            ▣ {data.project} · {data.list.length}
          </Text>
        </Box>
      </Box>

      {langs.length > 1 &&
        actions(ui, 'langs', [
          <Button key="lang-all" label={`All ${data.list.length}`} variant={shown === data.list ? 'primary' : 'secondary'} onPress={() => update($, langFilter, () => '')} />,
          ...langs.map(l => (
            <Button key={`lang-${l}`} label={`${l} ${data.list.filter(s => s.lang === l).length}`} variant={filter === l ? 'primary' : 'secondary'} onPress={() => update($, langFilter, () => l)} />
          )),
        ])}

      {told !== null && note(ui, 'note', told.text, told.tone)}

      {data.list.length === 0 && emptyState(ui, 'empty', '⌗', `No snippets for ${data.project} yet. /snippet <title> and the code from the next line on.`)}
      {shown.map(row)}

      {sectionTitle(ui, 'sec-new', 'New snippet')}
      {'Input' in ui ? (
        <ui.Input key="new-input" placeholder="Title on the first line, code below (or: title | code)" submitLabel="save" rows={narrow ? 4 : 6} onSubmit={(v: string) => saveFromPane($, v)} />
      ) : (
        <Text dimColor size={TYPE.label} wrap="wrap">{'No input field here: use /snippet <title> | <code>.'}</Text>
      )}
      {legend(ui, 'legend', 'Language from ```language or guessed. Keys and passwords are redacted before saving. "insert" puts the code as a block at the cursor of the prompt box.')}
    </Box>
  )
}
