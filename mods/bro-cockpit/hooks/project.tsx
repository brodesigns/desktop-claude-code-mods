import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { Idea, ProjectInfo } from '../types'
import { refreshCounts } from './counts'
import { shortHash } from './hash'
import { printable, redact } from './keys'
import { isNarrow } from './layout'
import { card, cardHead, emptyState, kv, legend, sectionTitle, SPACE, tile, tiles, toolbar, TYPE } from './style'

const ideas = atom({ plugin: 'bro-cockpit', key: 'ideaList' } as const, [])
const kindNow = atom({ plugin: 'bro-cockpit', key: 'ideaKind' } as const, 'idea')
const info = atom({ plugin: 'bro-cockpit', key: 'projectInfo' } as const, null)
const git = atom({ plugin: 'bro-cockpit', key: 'gitInfo' } as const, null)

const KINDS = [
  { id: 'idea', label: 'Idea', plural: 'Ideas', icon: '✦' },
  { id: 'change', label: 'Change request', plural: 'Change requests', icon: '✎' },
] as const
const NEXT: Record<string, string> = { open: 'running', running: 'done', done: 'open' }
const MARK: Record<string, string> = { open: '○ open', running: '◐ running', done: '● done' }
const TONE: Record<string, string> = { open: 'text', running: 'warning', done: 'success' }

// Folder name plus a short hash of the full root path: two repos with the same name keep their own ideas.
const keyOf = (project: string, root: string) => `project:${project}:${shortHash(root)}`
const legacyKeyOf = (project: string) => `project:${project}`

let loaded = ''

// Read once per project: its folder, what it is built with, its scripts, and the ideas saved in earlier sessions.
export async function loadProject($: EngineInterface, project: string) {
  const root = await $.session.root()
  if (`${project}\n${root}` === loaded) return
  let names: string[] = []
  try {
    names = (await $.fs.list(root)).map(f => f.name)
  } catch {
    names = []
  }
  const has = (...n: string[]) => n.some(x => names.includes(x))
  const kinds: string[] = []
  if (names.some(n => /^next\.config\./.test(n))) kinds.push('Next.js')
  if (has('wp-config.php', 'wp-content') || (has('style.css') && has('functions.php'))) kinds.push('WordPress')
  if (has('package.json')) kinds.push('Node')
  if (has('composer.json')) kinds.push('PHP')
  if (has('Dockerfile')) kinds.push('Docker')

  let scripts: { name: string; cmd: string }[] = []
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(await $.fs.read(`${root}/package.json`)) as { scripts?: Record<string, string> }
      scripts = Object.entries(pkg.scripts ?? {}).slice(0, 10).map(([name, cmd]) => ({ name: printable(name), cmd: printable(redact(String(cmd))) }))
    } catch {
      scripts = []
    }
  }

  const key = keyOf(project, root)
  let saved = ((await $.store.get(key)) as Idea[] | undefined) ?? []
  // One-time move from the old key that held only the folder name.
  if (saved.length === 0) {
    const legacy = ((await $.store.get(legacyKeyOf(project))) as Idea[] | undefined) ?? []
    if (Array.isArray(legacy) && legacy.length > 0) {
      saved = legacy
      await $.store.set(key, legacy)
      await $.store.delete(legacyKeyOf(project))
    }
  }
  await update($, ideas, () => saved)
  const data: ProjectInfo = { project, root: root.replace(/^\/Users\/[^/]+/, '~'), kinds, scripts, key }
  await update($, info, () => data)
  // Marked as loaded only now: a failure above leaves the project to be tried again on the next poll.
  loaded = `${project}\n${root}`
  await refreshCounts($)
}

// Read, change, write: the store is read again right before each write, so ideas saved by another session since
// this one loaded are kept (the change is applied to the stored list, not to the one in the state). The state
// then shows the merged list. 'none' when no project is known, 'refused' when the store did not take the value.
async function mutate($: EngineInterface, change: (list: Idea[]) => Idea[]): Promise<'saved' | 'none' | 'refused'> {
  const key = (await read($, info))?.key ?? ''
  if (key === '') return 'none'
  let merged: Idea[]
  try {
    const stored = await $.store.get(key)
    merged = change(Array.isArray(stored) ? (stored as Idea[]) : await read($, ideas))
    await $.store.set(key, merged)
  } catch {
    return 'refused'
  }
  await update($, ideas, () => merged)
  await refreshCounts($)

  return 'saved'
}

async function addIdea($: EngineInterface, kind: string, text: string): Promise<'empty' | 'saved' | 'none' | 'refused'> {
  const clean = printable(redact(text)).trim()
  if (clean === '') return 'empty'
  const at = await $.clock.now()

  return mutate($, list => [...list, { id: list.reduce((max, i) => Math.max(max, i.id), 0) + 1, kind, text: clean, status: 'open', at }])
}

const reply = (result: 'empty' | 'saved' | 'none' | 'refused', label: string, command: string) =>
  result === 'saved'
    ? `${label} saved (cockpit, Project tab).`
    : result === 'empty'
      ? `Nothing saved: please add a text, for example /${command} Dark theme.`
      : result === 'refused'
        ? 'Not saved: the plugin store refused the value (full or unreachable).'
        : `Not saved: the project is not detected yet. Please try again in a few seconds.`

// Ideas match by id and creation time: another session may have reused an id since this view was drawn.
const isSame = (a: Idea, b: Idea) => a.id === b.id && a.at === b.at

// The status moves from the one the click saw, so two sessions clicking the same idea do not step it twice.
async function cycle($: EngineInterface, idea: Idea) {
  await mutate($, list => list.map(i => (isSame(i, idea) ? { ...i, status: NEXT[idea.status] ?? 'open' } : i)))
}

// Click on the idea text: into the prompt box, else onto the clipboard.
async function useIdea($: EngineInterface, text: string, surface: RenderSurface) {
  const box = await $.prompt.fill({ text })
  if (box.isFilled) {
    $.ui.toast('Idea is in the prompt box. Press Enter to send.')
    return
  }
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? 'Prompt box unreachable. The idea is on the clipboard.' : 'Prompt box and clipboard unreachable.')
}

async function removeIdea($: EngineInterface, idea: Idea) {
  await mutate($, list => list.filter(i => !isSame(i, idea)))
}

export async function count($: EngineInterface) {
  return (await read($, ideas)).filter(i => i.status !== 'done').length
}

export async function summary($: EngineInterface) {
  const list = await read($, ideas)

  return { open: list.filter(i => i.status !== 'done').length, total: list.length }
}

export async function start($: EngineInterface) {
  await $.command.register({ name: 'idea', description: 'Save an idea for this project: /idea <text>' })
  await $.command.register({ name: 'change', description: 'Save a change request for this project: /change <text>' })
}

export const register: Register = on => {
  on('command.run', { command: 'idea' }, async ($, e) => {
    return { text: reply(await addIdea($, 'idea', String(e.args ?? '')), 'Idea', 'idea') }
  })

  on('command.run', { command: 'change' }, async ($, e) => {
    return { text: reply(await addIdea($, 'change', String(e.args ?? '')), 'Change request', 'change') }
  })
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const p = await read($, info)
  const g = await read($, git)
  const list = await read($, ideas)
  const kind = await read($, kindNow)
  const open = list.filter(i => i.status !== 'done').length

  if (p === null) return emptyState(ui, 'project-loading', '▣', 'Loading project info ...')

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {tiles(ui, 'project-tiles', [
        tile(ui, p.kinds[0] ?? 'Folder', 'Kind'),
        g !== null && g.branch !== '' ? tile(ui, g.branch, 'Branch') : tile(ui, '·', 'no git repository', 'inactive'),
        tile(ui, String(open), 'open ideas', open > 0 ? 'warning' : 'neutral'),
      ])}

      {card(ui, 'proj', 'neutral', [
        cardHead(ui, 'h', `▣ ${p.project}`),
        kv(ui, 'kv-dir', 'Folder', <Text size={TYPE.body} mono wrap="truncate-start">{p.root}</Text>, narrow),
        kv(ui, 'kv-kinds', 'Built with', <Text size={TYPE.body} wrap="wrap">{p.kinds.length > 0 ? p.kinds.join(' · ') : 'not detected'}</Text>, narrow),
      ])}

      {p.scripts.length > 0 &&
        card(ui, 'scripts', 'neutral', [
          cardHead(ui, 'h', 'Scripts', <Text dimColor size={TYPE.label}>package.json</Text>),
          ...p.scripts.map(sc => kv(ui, `sc-${sc.name}`, sc.name, <Text dimColor mono size={TYPE.label} wrap="truncate">{sc.cmd}</Text>, narrow)),
        ])}

      {sectionTitle(ui, 'ideas-title', 'Ideas and changes', <Text dimColor size={TYPE.label}>saved for {p.project}</Text>)}
      {toolbar(ui, 'idea-kinds', KINDS.map(k => (
        <Button key={`k-${k.id}`} label={`${k.icon} ${k.label}`} variant={kind === k.id ? 'primary' : 'secondary'} onPress={() => update($, kindNow, () => k.id)} />
      )))}
      {'Input' in ui ? (
        <Box key="idea-form" flexDirection="column" alignItems="stretch">
          <ui.Input key="idea-input" placeholder={kind === 'idea' ? 'New idea ...' : 'New change request ...'} submitLabel="save" rows={2} onSubmit={async (v: string) => void (await addIdea($, kind, v))} />
        </Box>
      ) : (
        <Text dimColor size={TYPE.label}>No input field here: use /idea or /change with a text.</Text>
      )}
      {list.length === 0 && emptyState(ui, 'ideas-empty', '✦', 'Nothing saved yet. Ideas stay in every session of this project.')}
      {KINDS.map(k => {
        const items = list.filter(i => i.kind === k.id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.id - b.id)
        if (items.length === 0) return null

        return (
          <Box key={`grp-${k.id}`} flexDirection="column" gap={SPACE.tight}>
            <Text dimColor size={TYPE.label} weight="semibold">{k.icon} {k.plural} ({items.length})</Text>
            {items.map(i =>
              card(
                ui,
                `idea-${i.id}`,
                i.status === 'running' ? 'warning' : 'neutral',
                <Box key="row" alignItems="center" gap={SPACE.base}>
                  <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                    <Button key={`use-${i.id}`} plain onPress={press => void useIdea($, i.text, press.surface)}>
                      <Text size={TYPE.body} wrap="wrap" dimColor={i.status === 'done'} strikethrough={i.status === 'done'}>{i.text}</Text>
                    </Button>
                  </Box>
                  <Box flexShrink={0} gap={SPACE.tight}>
                    <Button key={`st-${i.id}`} label={MARK[i.status] ?? i.status} variant="secondary" onPress={() => cycle($, i)} />
                    <Button key={`rm-${i.id}`} label="✕ Delete" variant="secondary" onPress={() => removeIdea($, i)} />
                  </Box>
                </Box>,
              ),
            )}
          </Box>
        )
      })}
      {legend(ui, 'ideas-legend', 'Click an idea to put its text into the prompt box. Click a status to change it: ○ open, ◐ running, ● done. Also via /idea and /change.')}
    </Box>
  )
}
