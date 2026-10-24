import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { changedPaths, countMarkers, isSkipped, joinPath, label, parseMarkers, summarize } from './scan'
import type { FileCounts } from './scan'
import { setIfChanged } from './state'

const summary = atom({ plugin: 'todo-band', key: 'summary' } as const, null)

// Caps: at most this many files per scan, none bigger than this, at most this many session files kept.
const MAX_FILES = 200
const MAX_BYTES = 512 * 1024
const MAX_SESSION = 100
const POLL_MS = 20_000

let config = { markers: parseMarkers(''), session: true }
// Files Claude wrote or edited this session (absolute). A reload starts over: the poll still has git's view.
const sessionFiles = new Set<string>()
// Counts per file, kept while mtime and size stay; only changed files are read again.
const cache = new Map<string, { stamp: string; counts: number[] }>()
let known = { cwd: '', top: '' }
let timer: { cancel: () => void } | null = null
let isBusy = false
let isDue = false

// A missing git binary makes process.run throw; that counts as "no repository".
async function git($: EngineInterface, args: string[]) {
  try {
    return await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: 10_000 })
  } catch {
    return null
  }
}

async function countFile($: EngineInterface, path: string): Promise<number[] | null> {
  if (isSkipped(path)) return null
  const stat = await $.fs.stat(path).catch(() => null)
  if (stat === null || stat.kind !== 'file' || stat.size > MAX_BYTES) return null
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const hit = cache.get(path)
  if (hit !== undefined && hit.stamp === stamp) return hit.counts
  const text = await $.fs.read(path).catch(() => null)
  if (text === null) return null
  const counts = countMarkers(text, config.markers)
  cache.set(path, { stamp, counts })

  return counts
}

async function scan($: EngineInterface) {
  const cwd = await $.session.cwd()
  if (cwd !== known.cwd) {
    const res = await git($, ['rev-parse', '--show-toplevel'])
    known = { cwd, top: res !== null && res.exitCode === 0 ? res.stdout.trim() : '' }
  }
  const paths = new Set<string>()
  if (known.top !== '') {
    const res = await git($, ['status', '--porcelain=v1', '-z', '-uall'])
    if (res !== null && res.exitCode === 0) for (const p of changedPaths(res.stdout)) paths.add(joinPath(known.top, p))
  }
  if (config.session) for (const p of sessionFiles) paths.add(p)

  const list = [...paths].slice(0, MAX_FILES)
  const found: FileCounts[] = []
  for (const path of list) {
    const counts = await countFile($, path)
    if (counts !== null) found.push({ path, counts })
  }
  for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path)

  const fresh = summarize(found, config.markers, known.top !== '' ? known.top : cwd)
  await setIfChanged(() => read($, summary), v => update($, summary, () => v), fresh.fileCount > 0 ? fresh : null)
}

// One scan at a time; a request while one runs makes it go round once more.
async function refresh($: EngineInterface) {
  if (isBusy) {
    isDue = true
    return
  }
  isBusy = true
  try {
    do {
      isDue = false
      await scan($)
    } while (isDue)
  } catch {
    // Nothing to show this round; the next poll tries again.
  } finally {
    isBusy = false
  }
}

async function start($: EngineInterface) {
  timer?.cancel()
  timer = $.clock.every(POLL_MS, () => void refresh($))
  void refresh($)
}

// Write, Edit and MultiEdit carry `file_path`, NotebookEdit `notebook_path`; read at run time (MultiEdit is untyped).
async function track($: EngineInterface, e: unknown) {
  const input = e as { file_path?: unknown; notebook_path?: unknown }
  const raw = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  if (raw === '') return
  const path = joinPath(await $.session.cwd(), raw)
  sessionFiles.delete(path)
  sessionFiles.add(path)
  if (sessionFiles.size > MAX_SESSION) {
    const oldest = sessionFiles.values().next().value
    if (oldest !== undefined) sessionFiles.delete(oldest)
  }
}

export const register: Register = (on, options) => {
  config = { markers: parseMarkers(String(options.markers ?? '')), session: options.sessionFiles !== false }

  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  // Display only: never blocks, looks at the result and rescans.
  on('tool.call', { tool: /^(Write|Edit|MultiEdit|NotebookEdit)$/ }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      if (config.session) await track($, e)
      await refresh($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, summary)
    if (s === null || s.fileCount === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const isNarrow = e.props.bodyColumns < 44
    const isLoud = s.counts.some(c => c.marker !== 'TODO')
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm">
          <Button key="todo" plain onPress={press => {
            void $.ui.copy({ text: s.files.join('\n'), surface: press.surface })
            void $.ui.toast('Copied the files with open markers')
          }}>
            <Text color={isLoud ? 'warning' : '#22d3ee'} weight="semibold">{label(s)}</Text>
            {isNarrow ? '' : <Text dimColor>{` · ${s.files.join(', ')}`}</Text>}
          </Button>
        </Box>
        {below}
      </Box>
    )
  })
}
