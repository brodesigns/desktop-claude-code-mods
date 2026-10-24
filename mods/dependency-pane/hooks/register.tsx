import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { DepCheck, DepGroup, DepInfo, Level, Outdated } from '../types'
import { parseComposer, parseOutdated, parsePackageJson, parsePyproject, parseRequirements } from './deps'
import { redact } from './keys'
import { isNarrow } from './layout'

const PANE = 'dependency-pane'
const TITLE = 'Dependencies'
const IDLE: DepCheck = { status: 'idle', at: 0, items: [], message: '' }

const info = atom({ plugin: 'dependency-pane', key: 'depInfo' } as const, null)
const check = atom({ plugin: 'dependency-pane', key: 'depCheck' } as const, IDLE)
const closed = atom({ plugin: 'dependency-pane', key: 'depClosed' } as const, [])

const FILES = ['package.json', 'requirements.txt', 'pyproject.toml', 'composer.json'] as const

const LEVEL: Record<Level, { glyph: string; color: string; word: string }> = {
  major: { glyph: '✗', color: 'error', word: 'Major' },
  minor: { glyph: '●', color: 'warning', word: 'Minor' },
  patch: { glyph: '○', color: 'suggestion', word: 'Patch' },
  none: { glyph: '✓', color: 'success', word: 'current' },
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
  const fresh: DepInfo = { root: root.replace(/^\/(Users|home)\/[^/]+/, '~'), groups, hasPackageJson, problems }
  await update($, info, () => fresh)
}

let busy = false

// `npm outdated` only on the person's press: it asks the npm registry, through their own npm.
// exit 1 means "something is outdated"; a missing npm or a timeout rejects.
export async function runCheck($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    await update($, check, (c): DepCheck => ({ ...c, status: 'running', message: '' }))
    const root = await $.session.root()
    let result: DepCheck
    try {
      const res = await $.process.run(['npm', 'outdated', '--json'], { cwd: root, timeoutMs: 90_000 })
      const parsed = parseOutdated(res.stdout)
      if ('error' in parsed) result = { status: 'error', at: await $.clock.now(), items: [], message: parsed.error }
      else if (res.exitCode > 1 && parsed.items.length === 0) {
        const line = redact(res.stderr.trim().split('\n').find(l => l.trim() !== '') ?? '').slice(0, 200)
        result = { status: 'error', at: await $.clock.now(), items: [], message: line !== '' ? line : `npm exited with code ${res.exitCode}.` }
      } else result = { status: 'done', at: await $.clock.now(), items: parsed.items.slice(0, 300), message: '' }
    } catch (err) {
      const why = redact(String(err instanceof Error ? err.message : err)).slice(0, 160)
      result = { status: 'error', at: await $.clock.now(), items: [], message: `npm not found or no answer within 90 seconds (${why}).` }
    }
    await update($, check, () => result)
  } catch {
    await update($, check, (): DepCheck => ({ ...IDLE, status: 'error', message: 'The check failed.' }))
  } finally {
    busy = false
  }
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

function outdatedRow(ui: Ui, o: Outdated, narrow: boolean) {
  const { Box, Text } = ui
  const l = LEVEL[o.level]
  const have = o.current !== '' ? o.current : 'missing'

  return (
    <Box key={`o-${o.name}`} gap="xs" alignItems="center">
      <Box width={2} flexShrink={0}>
        <Text color={l.color} weight="bold">{l.glyph}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Text mono size="caption" wrap="truncate">{o.name}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text mono tabular size="caption" wrap="truncate">
          {narrow ? [have, ' → ', <Text color={l.color}>{o.latest}</Text>] : [have, <Text dimColor> → {o.wanted} → </Text>, <Text color={l.color}>{o.latest}</Text>]}
        </Text>
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'deps', description: 'Show the dependencies of this project in a pane' })

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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const data = await read($, info)
    const c = await read($, check)
    const shut = await read($, closed)
    const narrow = isNarrow(e as unknown as RenderInput)
    const byName = new Map(c.items.map(o => [o.name, o]))
    const behind = c.items.filter(o => o.level !== 'none')

    const empty = (key: string, sentence: string) => (
      <Box key={key} borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs">
        <Text dimColor size="footnote" wrap="wrap">{sentence}</Text>
      </Box>
    )

    const groupView = (g: DepGroup) => {
      const isShut = shut.includes(g.id)
      return (
        <Box key={`g-${g.id}`} flexDirection="column" borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm">
          <Box justifyContent="space-between" alignItems="center" gap="sm">
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              <Button key={`h-${g.id}`} plain onPress={() => update($, closed, l => (l.includes(g.id) ? l.filter(x => x !== g.id) : [...l, g.id]))}>
                {isShut ? '▸' : '▾'} {g.file} <Text dimColor>· {g.section}</Text>
              </Button>
            </Box>
            <Box flexShrink={0}>
              <Text dimColor tabular size="caption">{g.deps.length}</Text>
            </Box>
          </Box>
          {!isShut && g.deps.map(d => {
            const o = g.file === 'package.json' ? byName.get(d.name) : undefined
            const l = o !== undefined ? LEVEL[o.level] : undefined
            return (
              <Box key={`d-${g.id}-${d.name}`} gap="sm" alignItems="center">
                <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                  <Text mono size="caption" wrap="truncate">{d.name}</Text>
                </Box>
                {l !== undefined && o !== undefined && o.level !== 'none' && !narrow && (
                  <Box flexShrink={0}>
                    <Text color={l.color} size="caption">{l.glyph} {o.latest}</Text>
                  </Box>
                )}
                <Box flexShrink={0} width={narrow ? 10 : 16} justifyContent="flex-end" overflow="hidden">
                  <Text mono dimColor size="caption" wrap="truncate">{d.range}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    }

    const status = () => {
      if (c.status === 'running') return <Text key="st" color="warning" size="footnote">● checking with npm outdated …</Text>
      if (c.status === 'error') {
        return (
          <Box key="st" borderStyle="round" overflow="hidden" borderColor="error" paddingX="sm">
            <Text color="error" size="footnote" wrap="wrap">✗ {c.message}</Text>
          </Box>
        )
      }
      if (c.status !== 'done') return null
      if (behind.length === 0) return <Text key="st" color="success" size="footnote">✓ All up to date</Text>
      const major = behind.filter(o => o.level === 'major').length
      const minor = behind.filter(o => o.level === 'minor').length

      return (
        <Box key="st" flexDirection="column" borderStyle="round" overflow="hidden" borderColor={major > 0 ? 'error' : minor > 0 ? 'warning' : 'subtle'} paddingX="sm">
          <Box justifyContent="space-between" gap="sm">
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              <Text weight="semibold" wrap="truncate">Outdated {behind.length}</Text>
            </Box>
            <Box flexShrink={0}>
              <Text dimColor size="caption">{narrow ? 'current → latest' : 'current → wanted → latest'}</Text>
            </Box>
          </Box>
          {behind.map(o => outdatedRow(ui, o, narrow))}
        </Box>
      )
    }

    if (data === null) return <Box padding="sm">{empty('none', '○ Not loaded yet. /deps reads the project files.')}</Box>
    const count = data.groups.reduce((n, g) => n + g.deps.length, 0)

    return (
      <Box flexDirection="column" gap="sm" padding={narrow ? 'xs' : 'sm'}>
        <Box justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="xs">
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text dimColor size="caption" wrap="truncate-start">{data.root} · {count} packages</Text>
          </Box>
          <Box gap="xs" flexWrap="wrap">
            {data.hasPackageJson && (
              <Button key="check" label={c.status === 'running' ? 'checking …' : 'Check outdated'} variant="primary" onPress={() => runCheck($)} />
            )}
            <Button key="reload" label="Reload" variant="secondary" onPress={() => load($)} />
          </Box>
        </Box>
        {status()}
        {data.problems.map((p, i) => (
          <Box key={`p${i}`} borderStyle="round" overflow="hidden" borderColor="warning" paddingX="sm">
            <Text color="warning" size="footnote" wrap="wrap">● {p}</Text>
          </Box>
        ))}
        {data.groups.length === 0 && data.problems.length === 0 && empty('empty', '○ No package.json, requirements.txt, pyproject.toml or composer.json in the project.')}
        {data.groups.map(groupView)}
        {data.hasPackageJson && (
          <Box key="legend" minWidth={0} overflow="hidden">
            <Text dimColor size="caption" wrap="wrap">✗ major behind · ● minor behind · ○ patch · "Check outdated" asks the npm registry through your npm</Text>
          </Box>
        )}
      </Box>
    )
  })
}
