import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput, ToolCallInput, ToolCallResult } from 'claude-code'

import type { FileRow } from '../types'
import { refreshCounts } from './counts'
import { isNarrow, isWide } from './layout'
import { card, emptyState, HEX, legend, SPACE, tile, tiles, toolbar, TYPE } from './style'

const files = atom({ plugin: 'bro-cockpit', key: 'fileList' } as const, [])

const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

const lineCount = (v: unknown) => (typeof v === 'string' && v !== '' ? v.split('\n').length : 0)

const added = (input: Record<string, unknown>): number => {
  if (Array.isArray(input.edits)) {
    return input.edits.reduce((sum: number, edit: unknown) => sum + lineCount((edit as Record<string, unknown>).new_string), 0)
  }

  return lineCount(input.new_string ?? input.content ?? input.new_source)
}

export async function track($: EngineInterface, e: ToolCallInput, ran: ToolCallResult) {
  const isRead = e.tool === 'Read'
  if ((!WRITERS.has(e.tool) && !isRead) || ran.deny !== undefined || ran.isError === true) return
  const input = e as unknown as Record<string, unknown>
  const path = String(input.file_path ?? input.notebook_path ?? '')
  if (path === '') return

  const at = await $.clock.now()
  const lines = isRead ? 0 : added(input)
  const isAgent = e.agentId !== undefined
  const isWrite = e.tool === 'Write'
  await update($, files, list => {
    const known = list.find(f => f.path === path)
    const base: FileRow = known ?? { path, reads: 0, writes: 0, edits: 0, lines: 0, agent: false, at }
    const row: FileRow = {
      ...base,
      reads: (base.reads ?? 0) + (isRead ? 1 : 0),
      writes: base.writes + (isWrite ? 1 : 0),
      edits: base.edits + (!isRead && !isWrite ? 1 : 0),
      lines: base.lines + lines,
      agent: base.agent || isAgent,
      at,
    }

    return [...list.filter(f => f.path !== path), row].slice(-300)
  })
}

const split = (path: string) => {
  const i = path.lastIndexOf('/')
  const dir = (i > 0 ? path.slice(0, i) : '/').replace(/^\/Users\/[^/]+/, '~')
  const parts = dir.split('/').filter(p => p !== '')
  const short = parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : dir

  return { dir, short, name: path.slice(i + 1) }
}

const EXT: Record<string, string> = {
  tsx: 'suggestion', ts: 'suggestion', jsx: 'suggestion', js: 'suggestion',
  md: 'remember', mdx: 'remember', txt: 'remember',
  json: 'warning', yaml: 'warning', yml: 'warning', toml: 'warning', env: 'warning',
  css: 'permission', scss: 'permission', html: 'permission', svg: 'permission',
  php: 'claude', py: 'claude', sh: 'claude', go: 'claude', rs: 'claude',
}
const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')

// A glowing dot for the files changed just now.
const FRESH =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><circle cx="6" cy="6" r="2.6" fill="${HEX.warning}"/>` +
  `<circle cx="6" cy="6" r="2.6" fill="none" stroke="${HEX.warning}">` +
  '<animate attributeName="r" values="2.6;5.6" dur="1.6s" repeatCount="indefinite"/>' +
  '<animate attributeName="stroke-opacity" values=".9;0" dur="1.6s" repeatCount="indefinite"/></circle></svg>'

export async function count($: EngineInterface) {
  return (await read($, files)).length
}

export async function summary($: EngineInterface) {
  const list = await read($, files)

  return { changed: list.filter(f => f.writes + f.edits > 0).length, read: list.filter(f => (f.reads ?? 0) > 0).length }
}

const filter = atom({ plugin: 'bro-cockpit', key: 'fileFilter' } as const, 'all')
const changed = (f: FileRow) => f.writes + f.edits > 0

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const wide = isWide(e)
  const all = await read($, files)
  const mode = await read($, filter)
  const list = all.filter(f => mode === 'all' || (mode === 'changed' ? changed(f) : !changed(f)))
  const nChanged = all.filter(changed).length
  const nRead = all.filter(f => (f.reads ?? 0) > 0).length
  const total = all.reduce((sum, f) => sum + f.lines, 0)
  const max = Math.max(1, ...list.map(f => f.lines))
  const newest = new Set([...all].sort((a, b) => b.at - a.at).slice(0, 2).map(f => f.path))

  // Oldest first inside a folder; the folder with the latest change sits at the bottom, so the list grows downwards.
  const dirs: { dir: string; short: string; items: FileRow[]; lines: number; at: number }[] = []
  for (const f of [...list].sort((a, b) => a.at - b.at)) {
    const { dir, short } = split(f.path)
    const group = dirs.find(d => d.dir === dir)
    if (group) {
      group.items.push(f)
      group.lines += f.lines
      group.at = Math.max(group.at, f.at)
    } else dirs.push({ dir, short, items: [f], lines: f.lines, at: f.at })
  }
  dirs.sort((a, b) => a.at - b.at)

  const chips = [
    { id: 'all', label: `All ${all.length}` },
    { id: 'changed', label: `Changed ${nChanged}` },
    { id: 'read', label: `Read only ${all.length - nChanged}` },
  ]

  return (
    <Box flexDirection="column" gap={SPACE.base}>
      {tiles(ui, 'file-tiles', [
        tile(ui, String(nChanged), 'changed', nChanged > 0 ? 'info' : 'neutral'),
        tile(ui, String(nRead), 'read'),
        tile(ui, `+${total}`, 'lines', total > 0 ? 'success' : 'neutral'),
      ])}
      {toolbar(
        ui,
        'file-bar',
        chips.map(c => <Button key={`ff-${c.id}`} label={c.label} variant={mode === c.id ? 'primary' : 'secondary'} onPress={() => update($, filter, () => c.id)} />),
        <Button key="clear-files" label="Clear" variant="secondary" onPress={async () => {
          await update($, files, () => [])
          await refreshCounts($)
        }} />,
      )}
      {list.length === 0 && (all.length === 0
        ? emptyState(ui, 'files-empty', '▤', 'No file read or changed yet.')
        : emptyState(ui, 'files-none', '⌕', 'Nothing for this filter.'))}
      {dirs.map(g =>
        card(ui, `dir-${g.dir}`, 'neutral', [
          <Box key="head" justifyContent="space-between" alignItems="center" gap={SPACE.base}>
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              <Text weight="semibold" size={TYPE.body} wrap="truncate-start">▾ {g.short}</Text>
            </Box>
            <Box flexShrink={0}>
              <Text dimColor tabular size={TYPE.label}>{g.items.length} {g.items.length === 1 ? 'file' : 'files'}{g.lines > 0 ? ` · +${g.lines}` : ''}</Text>
            </Box>
          </Box>,
          ...g.items.map(f => {
            const { name } = split(f.path)
            const ext = extOf(name)
            const reads = f.reads ?? 0
            const blocks = '█'.repeat(Math.max(1, Math.round((f.lines / max) * 6)))
            const isFresh = newest.has(f.path)
            const isNew = f.writes > 0 && f.edits === 0

            // Fixed columns: mark, type, name (gives way), status, bar, lines.
            return (
              <Box key={`file-${f.path}`} alignItems="center" gap={SPACE.base}>
                <Box width={2} flexShrink={0}>
                  {isFresh && 'Svg' in ui ? <ui.Svg source={FRESH} alt="just touched" width={12} height={12} isInteractive /> : <Text dimColor>{isFresh ? '●' : '·'}</Text>}
                </Box>
                {!narrow && (
                  <Box width={5} flexShrink={0}>
                    <Text color={EXT[ext] ?? 'inactive'} size={TYPE.label} weight="bold">{ext === '' ? '·' : ext.slice(0, 4).toUpperCase()}</Text>
                  </Box>
                )}
                <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                  <Text weight="medium" size={TYPE.body} wrap="truncate">{f.agent ? <Text color="claude">▌</Text> : ''}{name}</Text>
                </Box>
                <Box width={narrow ? 5 : 22} flexShrink={0} justifyContent="flex-end" gap={SPACE.tight} overflow="hidden">
                  {reads > 0 && <Text color="remember" size={TYPE.label} wrap="truncate">{narrow ? '▤' : `▤ read${reads > 1 ? ` ×${reads}` : ''}`}</Text>}
                  {changed(f) && (
                    <Text color={isNew ? 'permission' : 'suggestion'} size={TYPE.label} weight="semibold" wrap="truncate">
                      {narrow ? (isNew ? '◧' : '✎') : isNew ? '◧ new' : `✎ changed${f.edits > 1 ? ` ×${f.edits}` : ''}`}
                    </Text>
                  )}
                </Box>
                {wide && (
                  <Box width={6} flexShrink={0}>
                    <Text color="success" size={TYPE.label}>{f.lines > 0 ? blocks : ''}</Text>
                  </Box>
                )}
                <Box width={6} flexShrink={0} justifyContent="flex-end">
                  <Text color="success" tabular size={TYPE.label}>{f.lines > 0 ? `+${f.lines}` : ''}</Text>
                </Box>
              </Box>
            )
          }),
        ]),
      )}
      {all.length > 0 && legend(ui, 'files-legend', '▤ read · ✎ changed · ◧ newly written · ▌ by a subagent')}
    </Box>
  )
}
