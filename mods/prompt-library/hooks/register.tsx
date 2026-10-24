import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { Prompt, PromptLib, PromptNote, PromptScope } from '../types'
import { shortHash } from './hash'
import { redactCounted } from './keys'
import { isNarrow } from './layout'
import { asList, compose, fillIn, findByName, firstLine, idOf, parseSave, placeholders, upsert } from './library'
import { projectOf } from './project'
import { actions, card, cardHead, chip, emptyState, legend, line, note, sectionTitle, SPACE, TYPE } from './style'

const PANE = 'prompt-library'
const GLOBAL_KEY = 'prompts:global'

const lib = atom({ plugin: 'prompt-library', key: 'promptLib' } as const, null)
const query = atom({ plugin: 'prompt-library', key: 'promptQuery' } as const, '')
const openId = atom({ plugin: 'prompt-library', key: 'promptOpen' } as const, '')
const lastNote = atom({ plugin: 'prompt-library', key: 'promptNote' } as const, null)
const values = atom({ plugin: 'prompt-library', key: 'promptValues' } as const, {})
const newScope = atom({ plugin: 'prompt-library', key: 'promptScope' } as const, 'global')

// Loads the global list and the project's list; again when the project root moved or `force` asks.
async function ensure($: EngineInterface, force = false): Promise<PromptLib> {
  const root = await $.session.root()
  const current = await read($, lib)
  if (!force && current !== null && current.root === root) return current
  const { project, key } = projectOf(root, 'prompts')
  const fresh: PromptLib = { root, project, key, global: asList(await $.store.get(GLOBAL_KEY)), local: asList(await $.store.get(key)) }
  await update($, lib, () => fresh)

  return fresh
}

// Read, change, write: the store first, so a second session's prompts are not overwritten. False when the store refused.
async function mutate($: EngineInterface, scope: PromptScope, change: (list: Prompt[]) => Prompt[]): Promise<boolean> {
  const loaded = await ensure($)
  const key = scope === 'global' ? GLOBAL_KEY : loaded.key
  const changed = change(asList(await $.store.get(key)))
  try {
    await $.store.set(key, changed)
  } catch {
    return false
  }
  await update($, lib, cur => (cur === null ? cur : scope === 'global' ? { ...cur, global: changed } : { ...cur, local: changed }))

  return true
}

async function say($: EngineInterface, text: string, tone: PromptNote['tone']) {
  await update($, lastNote, () => ({ text, tone }))
}

const SCOPE_WORD: Record<PromptScope, string> = { global: 'all projects', project: 'only this project' }

// Saves from the command or the pane's field; the answer says exactly what happened.
async function save($: EngineInterface, args: string, scopeOverride?: PromptScope): Promise<string> {
  const parsed = parseSave(args)
  if ('error' in parsed) {
    return parsed.error === 'name'
      ? 'Not saved: the name may have at most 40 characters and no |.'
      : parsed.error === 'text'
        ? 'Not saved: the prompt text is missing after the colon.'
        : 'Not saved: please write it like this: /prompt-save <name>: <text> (with --project for this project only).'
  }
  // The pane's choice, unless the text itself asks for --project.
  const scope = parsed.scope === 'project' ? 'project' : (scopeOverride ?? parsed.scope)
  const clean = redactCounted(parsed.text)
  const prompt: Prompt = { id: idOf(scope, parsed.name), name: parsed.name, text: clean.text, at: await $.clock.now() }
  let isNew = true
  const isSaved = await mutate($, scope, list => {
    const done = upsert(list, prompt)
    isNew = done.isNew

    return done.list
  })
  if (!isSaved) return 'Not saved: the plugin store refused the value (full or unreachable).'
  const masked = clean.masked > 0 ? ` Warning: ${clean.masked} ${clean.masked === 1 ? 'place looked' : 'places looked'} like a key and ${clean.masked === 1 ? 'was' : 'were'} redacted.` : ''

  return `Prompt "${parsed.name}" ${isNew ? 'saved' : 'updated'} (${SCOPE_WORD[scope]}). Use it: /p ${parsed.name}${masked}`
}

const REFUSAL: Record<string, string> = { no_composer: 'this surface does not let mods write into the prompt box', dialog: 'a dialog is open' }
const why = (refusal: string | undefined) => (refusal === undefined ? 'refused' : (REFUSAL[refusal] ?? refusal))

// Puts the text in the prompt box. The engine has no caret position for it, so open placeholders stay as {{name}} in the text.
async function fill($: EngineInterface, text: string) {
  return $.prompt.fill({ text })
}

// The pane's "use": the prompt box first, the clipboard second, the full text in the card last.
async function usePrompt($: EngineInterface, p: Prompt, surface: RenderSurface) {
  const holes = placeholders(p.text)
  if (holes.length > 0 && (await read($, openId)) !== p.id) {
    await update($, openId, () => p.id)
    await say($, `"${p.name}" has placeholders: enter the values and press "use" again. Empty ones stay as {{…}}.`, 'warning')
    return
  }
  const text = await valuesFor($, p)
  const box = await fill($, text)
  if (box.isFilled) {
    await say($, `"${p.name}" is in the prompt box. Press Enter to send.`, 'success')
    return
  }
  const copied = await $.ui.copy({ text, surface })
  if (copied.isCopied) {
    await say($, `Prompt box unreachable (${why(box.refusal)}). The text is on the clipboard.`, 'warning')
    return
  }
  await update($, openId, () => p.id)
  await say($, `Prompt box and clipboard unreachable (${why(box.refusal)}). Select and copy the text below or use "send".`, 'error')
}

async function valuesFor($: EngineInterface, p: Prompt) {
  const typed = await read($, values)
  const own: Record<string, string> = {}
  for (const hole of placeholders(p.text)) own[hole] = typed[`${p.id}:${hole}`] ?? ''

  return fillIn(p.text, own)
}

// "send": a turn of its own as the person's words, once the session is idle.
async function sendPrompt($: EngineInterface, p: Prompt) {
  await say($, `"${p.name}" will be sent as soon as the session is idle …`, 'warning')
  const sent = await $.prompt.submit({ text: await valuesFor($, p), asUser: true })
  await say($, sent.drop === undefined ? `"${p.name}" sent.` : `"${p.name}" was not sent.`, sent.drop === undefined ? 'success' : 'error')
}

async function copyPrompt($: EngineInterface, p: Prompt, surface: RenderSurface) {
  const copied = await $.ui.copy({ text: await valuesFor($, p), surface })
  await say($, copied.isCopied ? `"${p.name}" is on the clipboard.` : 'Clipboard unreachable: select and copy the text below.', copied.isCopied ? 'success' : 'error')
  if (!copied.isCopied) await update($, openId, () => p.id)
}

async function removePrompt($: EngineInterface, p: Prompt, scope: PromptScope) {
  const isSaved = await mutate($, scope, list => list.filter(one => one.id !== p.id))
  await say($, isSaved ? `"${p.name}" deleted.` : 'Not deleted: the plugin store refused.', isSaved ? 'success' : 'error')
}

async function saveFromPane($: EngineInterface, value: string) {
  const answer = await save($, value, await read($, newScope))
  await say($, answer, answer.startsWith('Not') ? 'error' : answer.includes('Warning') ? 'warning' : 'success')
}

// `/p <name> [values]`: into the box; where no box takes it, the text as the command's output.
async function runP($: EngineInterface, args: string): Promise<string> {
  if (args.trim() === '') return 'Which prompt? /p <name>, /prompts shows the list.'
  const loaded = await ensure($)
  const found = findByName([...loaded.local, ...loaded.global], args)
  if (found === undefined) return `No prompt "${args.trim().slice(0, 40)}" found. /prompts shows the list.`
  const { text, open } = compose(found.prompt, found.rest)
  const box = await fill($, text)
  if (box.isFilled) {
    const left = open.length > 0 ? ` Still open: ${open.map(hole => `{{${hole}}}`).join(', ')}.` : ''

    return `"${found.prompt.name}" is in the prompt box.${left}`
  }
  const copied = await $.ui.copy({ text })

  return `Prompt box unreachable (${why(box.refusal)})${copied.isCopied ? ', the text is on the clipboard' : ''}. The text:\n\n${text}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'prompt-save', description: 'Save a prompt: /prompt-save [--project] <name>: <text>', argumentHint: '[--project] <name>: <text>' })
    await $.command.register({ name: 'prompts', description: 'Open the prompt library pane: /prompts [search]', argumentHint: '[search]' })
    await $.command.register({ name: 'p', description: 'Put a saved prompt into the prompt box: /p <name> [value | value]', argumentHint: '<name> [value | value]' })
    await ensure($)

    return next(e)
  })

  // The project can move (/cd, a worktree): checked after each turn, loaded only when it changed.
  on('turn.complete', async ($, e, next) => {
    await ensure($)

    return next(e)
  })

  on('command.run', { command: 'prompt-save' }, async ($, e) => ({ text: await save($, e.args) }))

  on('command.run', { command: 'prompts' }, async ($, e) => {
    await ensure($, true)
    await update($, query, () => e.args.trim())
    await $.ui.open({ id: PANE, title: 'Prompts' })

    return { text: 'Prompt library opened.' }
  })

  on('command.run', { command: 'p' }, async ($, e) => ({ text: await runP($, e.args) }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => view($, e))
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const data = await read($, lib)
  const q = await read($, query)
  const open = await read($, openId)
  const told = await read($, lastNote)
  const typed = await read($, values)
  const scope = await read($, newScope)
  const hasInput = 'Input' in ui

  if (data === null) return emptyState(ui, 'loading', '❝', 'Loading prompts …')

  const needle = q.trim().toLowerCase()
  const hits = (list: Prompt[]) => (needle === '' ? list : list.filter(p => `${p.name}\n${p.text}`.toLowerCase().includes(needle)))
  const local = hits(data.local)
  const global = hits(data.global)
  const total = data.local.length + data.global.length

  const row = (p: Prompt, where: PromptScope) => {
    const isOpen = open === p.id
    const holes = placeholders(p.text)
    const hid = shortHash(p.id)

    return card(ui, `card-${hid}`, isOpen ? 'accent' : 'neutral', [
      cardHead(ui, `head-${hid}`, p.name, chip(ui, `scope-${hid}`, where === 'global' ? '◆ global' : '▣ project', where === 'global' ? 'info' : 'accent')),
      isOpen ? (
        <Box key={`full-${hid}`} minWidth={0} overflow="hidden">
          <Text size={TYPE.body} wrap="wrap">{p.text}</Text>
        </Box>
      ) : (
        line(ui, `first-${hid}`, firstLine(p.text))
      ),
      isOpen && holes.length > 0 && hasInput ? (
        <Box key={`holes-${hid}`} flexDirection="column" gap={SPACE.tight}>
          {holes.map((hole, i) => (
            <ui.Input
              key={`val-${hid}-${i}`}
              label={`{{${hole}}}`}
              value={typed[`${p.id}:${hole}`] ?? ''}
              placeholder="Value"
              submitLabel="apply"
              onInput={(v: string) => void update($, values, all => ({ ...all, [`${p.id}:${hole}`]: v }))}
              onSubmit={(v: string) => void update($, values, all => ({ ...all, [`${p.id}:${hole}`]: v }))}
            />
          ))}
        </Box>
      ) : null,
      actions(ui, `act-${hid}`, [
        <Button key={`use-${hid}`} label="↳ use" variant="primary" onPress={press => usePrompt($, p, press.surface)} />,
        <Button key={`more-${hid}`} label={isOpen ? '▾ less' : narrow ? '▸ more' : '▸ full text'} variant="secondary" onPress={() => update($, openId, cur => (cur === p.id ? '' : p.id))} />,
        isOpen ? <Button key={`copy-${hid}`} label="⧉ copy" variant="secondary" onPress={press => copyPrompt($, p, press.surface)} /> : null,
        isOpen ? <Button key={`send-${hid}`} label="↵ send" variant="secondary" onPress={() => sendPrompt($, p)} /> : null,
        <Button key={`rm-${hid}`} label="✕ delete" variant="secondary" onPress={() => removePrompt($, p, where)} />,
      ]),
    ])
  }

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={1} minWidth={0} overflow="hidden">
          <Text size={TYPE.heading} weight="semibold" wrap="truncate">Prompts</Text>
        </Box>
        <Box flexShrink={0}>
          <Text dimColor size={TYPE.label}>{needle === '' ? `${total} saved` : `${local.length + global.length} of ${total}`}</Text>
        </Box>
      </Box>

      {hasInput ? (
        <ui.Input key="search" label="Search" placeholder="Name or text …" value={q} submitLabel="search" onInput={(v: string) => void update($, query, () => v)} onSubmit={(v: string) => void update($, query, () => v)} />
      ) : (
        <Text dimColor size={TYPE.label}>{'Search: /prompts <word>'}</Text>
      )}
      {needle !== '' && actions(ui, 'search-act', [<Button key="clear" label="✕ Clear search" variant="secondary" onPress={() => update($, query, () => '')} />])}

      {told !== null && note(ui, 'note', told.text, told.tone)}

      {total === 0 && emptyState(ui, 'empty', '❝', 'No prompts yet. /prompt-save review: Check {{file}} for errors. With --project for this project only.')}
      {total > 0 && local.length + global.length === 0 && emptyState(ui, 'no-hits', '⌕', `Nothing found for "${q.trim()}".`)}

      {local.length > 0 && sectionTitle(ui, 'sec-local', `Only ${data.project}`, <Text dimColor size={TYPE.label}>{local.length}</Text>)}
      {local.map(p => row(p, 'project'))}
      {global.length > 0 && sectionTitle(ui, 'sec-global', 'All projects', <Text dimColor size={TYPE.label}>{global.length}</Text>)}
      {global.map(p => row(p, 'global'))}

      {sectionTitle(ui, 'sec-new', 'New prompt')}
      {hasInput ? (
        <Box key="new" flexDirection="column" gap={SPACE.tight}>
          {actions(ui, 'new-scope', [
            <Button key="scope-global" label="◆ all projects" variant={scope === 'global' ? 'primary' : 'secondary'} onPress={() => update($, newScope, () => 'global')} />,
            <Button key="scope-project" label={`▣ only ${data.project}`} variant={scope === 'project' ? 'primary' : 'secondary'} onPress={() => update($, newScope, () => 'project')} />,
          ])}
          <ui.Input key="new-input" placeholder="name: text of the prompt" submitLabel="save" rows={narrow ? 2 : 3} onSubmit={(v: string) => saveFromPane($, v)} />
        </Box>
      ) : (
        <Text dimColor size={TYPE.label} wrap="wrap">{'No input field here: use /prompt-save <name>: <text>.'}</Text>
      )}
      {legend(ui, 'legend', '"use" puts the prompt into the prompt box without sending it. {{name}} marks a placeholder that is asked for first. Also via /p <name> [value | value].')}
    </Box>
  )
}
