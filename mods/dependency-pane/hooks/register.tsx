import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { DepCheck, DepGroup, DepInfo, DepNote, Level } from '../types'
import { parseComposer, parseOutdated, parsePackageJson, parsePyproject, parseRequirements } from './deps'
import { redact } from './keys'
import { isNarrow } from './layout'
import { emptyState, MARK, note, SPACE, TONE, TYPE } from './style'

const PANE = 'dependency-pane'
const TITLE = 'Dependencies'
const ACCENT = '#39639E'
const IDLE: DepCheck = { status: 'idle', root: '', at: 0, items: [], message: '' }

const info = atom({ plugin: 'dependency-pane', key: 'depInfo' } as const, null)
const check = atom({ plugin: 'dependency-pane', key: 'depCheck' } as const, IDLE)
// Ids of the unfolded groups; every group starts folded.
const opened = atom({ plugin: 'dependency-pane', key: 'depOpen' } as const, [])
const lastNote = atom({ plugin: 'dependency-pane', key: 'depNote' } as const, null)

const FILES = ['package.json', 'requirements.txt', 'pyproject.toml', 'composer.json'] as const

// A mark next to every colour: a level is never colour alone.
const LEVEL: Record<Level, { glyph: string; color: string }> = {
  major: { glyph: MARK.error, color: TONE.error },
  minor: { glyph: MARK.warning, color: TONE.warning },
  patch: { glyph: '○', color: TONE.info },
  none: { glyph: MARK.success, color: TONE.success },
}

const parse = (file: (typeof FILES)[number], text: string): DepGroup[] => {
  switch (file) {
    case 'package.json': return parsePackageJson(text)
    case 'composer.json': return parseComposer(text)
    case 'requirements.txt': return parseRequirements(text)
    case 'pyproject.toml': return parsePyproject(text)
  }
}

// Reads the manifests in the project root. A missing file is skipped, a broken one is listed as a problem.
// A check result that belongs to another root is dropped, so it is never matched against this project.
export async function load($: EngineInterface) {
  const root = await $.session.root()
  const groups: DepGroup[] = []
  const problems: string[] = []
  let hasPackageJson = false
  for (const file of FILES) {
    const path = `${root.replace(/\/+$/, '')}/${file}`
    try {
      if (!(await $.fs.exists(path))) continue
      if (file === 'package.json') hasPackageJson = true
      groups.push(...parse(file, await $.fs.read(path)))
    } catch (err) {
      problems.push(`${file}: ${redact(String(err instanceof Error ? err.message : err)).slice(0, 160)}`)
    }
  }
  const fresh: DepInfo = { root, groups, hasPackageJson, problems }
  if (JSON.stringify(await read($, info)) !== JSON.stringify(fresh)) await update($, info, () => fresh)
  const old = await read($, check)
  if (old.status !== 'idle' && old.root !== root) {
    await update($, check, () => IDLE)
    await update($, opened, () => [])
  }
}

let busy = false

// `npm outdated` only on the person's press: it asks the npm registry, through their own npm.
// exit 1 means "something is outdated"; a missing npm or a timeout rejects.
export async function runCheck($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    const root = await $.session.root()
    await update($, check, (): DepCheck => ({ ...IDLE, status: 'running', root }))
    let result: DepCheck
    try {
      const res = await $.process.run(['npm', 'outdated', '--json'], { cwd: root, timeoutMs: 90_000 })
      const parsed = parseOutdated(res.stdout)
      if ('error' in parsed) result = { status: 'error', root, at: await $.clock.now(), items: [], message: parsed.error }
      else if (res.exitCode > 1 && parsed.items.length === 0) {
        const line = redact(res.stderr.trim().split('\n').find(l => l.trim() !== '') ?? '').slice(0, 200)
        result = { status: 'error', root, at: await $.clock.now(), items: [], message: line !== '' ? line : `npm exited with code ${res.exitCode}.` }
      } else result = { status: 'done', root, at: await $.clock.now(), items: parsed.items.slice(0, 300), message: '' }
    } catch (err) {
      const why = redact(String(err instanceof Error ? err.message : err)).slice(0, 160)
      result = { status: 'error', root, at: await $.clock.now(), items: [], message: `npm not found or no answer within 90 seconds (${why}).` }
    }
    await update($, check, () => result)
  } catch {
    await update($, check, (): DepCheck => ({ ...IDLE, status: 'error', message: 'The check failed.' }))
  } finally {
    busy = false
  }
}

// Copies the upgrade command for one package. It never runs npm install.
async function copyUpgrade($: EngineInterface, name: string, surface: RenderSurface) {
  const command = `npm i ${name}@latest`
  const copied = await $.ui.copy({ text: command, surface })
  const answer: DepNote = copied.isCopied ? { text: `Copied: ${command}`, tone: 'success' } : { text: `Clipboard unreachable. Run: ${command}`, tone: 'error' }
  await update($, lastNote, () => answer)
}

const ago = (ms: number) => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  return `${Math.floor(minutes / 60)} h ago`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'deps', description: 'Show the dependencies of this project in a pane' })
    try {
      await load($)
    } catch {
      // The pane offers "reload" when nothing was loaded.
    }

    return next(e)
  })

  on('command.run', { command: 'deps' }, async $ => {
    try {
      await load($)
    } catch {
      // The pane says what it has.
    }
    const res = await $.ui.open({ id: PANE, title: TITLE })

    return { text: res.isPlaced ? 'Dependencies opened.' : 'Dependencies: the pane is waiting for room.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => view($, e))
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const data = await read($, info)
  const raw = await read($, check)
  const open = await read($, opened)
  const told = await read($, lastNote)
  const narrow = isNarrow(e)

  if (data === null) {
    return (
      <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
        {emptyState(ui, 'none', '○', 'Not loaded yet. /deps reads the project files.')}
        <Box key="reload-box">
          <Button key="reload" plain onPress={() => load($)}>
            <Text size={TYPE.label} color={ACCENT} weight="semibold">↻ reload</Text>
          </Button>
        </Box>
      </Box>
    )
  }

  // A result of another project root is never shown.
  const c = raw.root === data.root ? raw : IDLE
  const byName = new Map(c.items.map(o => [o.name, o]))
  const behind = c.items.filter(o => o.level !== 'none')
  const total = data.groups.reduce((n, g) => n + g.deps.length, 0)
  const now = c.status === 'done' ? await $.clock.now() : 0

  const statusLine = () => {
    if (c.status === 'running') return note(ui, 'st', 'checking with npm outdated …', 'warning')
    if (c.status === 'error') return note(ui, 'st', c.message, 'error')
    if (c.status !== 'done') return null
    const when = `checked ${ago(now - c.at)}`
    if (behind.length === 0) return note(ui, 'st', `all up to date · ${when}`, 'success')
    const major = behind.filter(o => o.level === 'major').length
    const minor = behind.filter(o => o.level === 'minor').length

    return note(ui, 'st', `${behind.length} outdated${major > 0 ? ` (${major} major)` : ''} · ${when}`, major > 0 ? 'error' : minor > 0 ? 'warning' : 'info')
  }

  const toggle = (id: string) => update($, opened, ids => (ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]))

  const groupView = (g: DepGroup) => {
    const isOpen = open.includes(g.id)
    const late = g.file === 'package.json' ? g.deps.map(d => byName.get(d.name)).filter(o => o !== undefined && o.level !== 'none') : []
    const worst = late.some(o => o?.level === 'major') ? 'major' : late.some(o => o?.level === 'minor') ? 'minor' : 'patch'

    return (
      <Box key={`g-${g.id}`} flexDirection="column" gap={SPACE.tight}>
        <Box alignItems="center" gap={SPACE.base}>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Button key={`h-${g.id}`} plain onPress={() => toggle(g.id)}>
              <Text size={TYPE.body} wrap="truncate">{`${isOpen ? '▾' : '▸'} ${g.file}`}</Text>
              <Text size={TYPE.body} dimColor wrap="truncate">{` · ${g.section}`}</Text>
            </Button>
          </Box>
          <Box flexShrink={0} gap={SPACE.base}>
            <Text dimColor tabular size={TYPE.label}>{g.deps.length}</Text>
            {late.length > 0 && <Text color={LEVEL[worst].color} tabular size={TYPE.label}>{`${MARK.warning} ${late.length}`}</Text>}
          </Box>
        </Box>
        {isOpen && (
          <Box key={`rows-${g.id}`} flexDirection="column" gap={SPACE.tight} marginLeft="md" minWidth={0} overflow="hidden">
            {g.deps.map(d => {
              const o = g.file === 'package.json' ? byName.get(d.name) : undefined
              const l = o !== undefined && o.level !== 'none' ? LEVEL[o.level] : undefined

              return (
                <Box key={`d-${g.id}-${d.name}`} gap={SPACE.base} alignItems="center">
                  <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                    <Text mono size={TYPE.label} wrap="truncate">{d.name}</Text>
                  </Box>
                  {l !== undefined && o !== undefined && (
                    <Box flexShrink={0}>
                      <Text color={l.color} size={TYPE.label}>{`${l.glyph} ${o.latest}`}</Text>
                    </Box>
                  )}
                  <Box flexShrink={0} width={narrow ? 10 : 16} justifyContent="flex-end" overflow="hidden">
                    <Text mono dimColor size={TYPE.label} wrap="truncate">{d.range}</Text>
                  </Box>
                  {l !== undefined && (
                    <Box flexShrink={0}>
                      <Button key={`cp-${g.id}-${d.name}`} plain onPress={press => copyUpgrade($, d.name, press.surface)}>
                        <Text size={TYPE.label} color={ACCENT} weight="semibold">⧉</Text>
                      </Button>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={0}>
          <Text size={TYPE.title} weight="semibold">Dependencies</Text>
        </Box>
        <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end" gap={SPACE.base}>
          <Text dimColor size={TYPE.label} wrap="truncate">{`${total} ${total === 1 ? 'package' : 'packages'}`}</Text>
          {data.hasPackageJson && c.status !== 'running' && (
            <Button key="check" plain onPress={() => runCheck($)}>
              <Text size={TYPE.label} color={ACCENT} weight="semibold">↻ check</Text>
            </Button>
          )}
        </Box>
      </Box>

      {statusLine()}
      {told !== null && note(ui, 'note', told.text, told.tone)}
      {data.problems.map((p, i) => note(ui, `p${i}`, p, 'warning'))}
      {data.groups.length === 0 && data.problems.length === 0 && emptyState(ui, 'empty', '○', 'No package.json, requirements.txt, pyproject.toml or composer.json in the project.')}
      {data.groups.length === 0 && (
        <Box key="reload-box">
          <Button key="reload" plain onPress={() => load($)}>
            <Text size={TYPE.label} color={ACCENT} weight="semibold">↻ reload</Text>
          </Button>
        </Box>
      )}
      {data.groups.map(groupView)}
    </Box>
  )
}
