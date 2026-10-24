import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { EnvInfo } from '../types'
import { byPrecedence, envName, isEnvFile, isTemplate, isUnread, parseVariables, toneOf } from './envfile'
import { setIfChanged } from './state'

const info = atom({ plugin: 'env-band', key: 'envInfo' } as const, null)

const POLL_MS = 30_000
const MAX_FILES = 20
const MAX_BYTES = 256 * 1024

let config = { variables: parseVariables(''), ignoreTemplates: true }
// Per file only the environment name it set (a plain word or ''), kept while mtime and size stay. Never content.
const cache = new Map<string, { stamp: string; name: string }>()
let timer: { cancel: () => void } | null = null
let isBusy = false
let isDue = false

async function nameIn($: EngineInterface, path: string, file: string): Promise<string> {
  if (isUnread(file)) return ''
  const stat = await $.fs.stat(path).catch(() => null)
  if (stat === null || stat.kind !== 'file' || stat.size > MAX_BYTES) return ''
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const hit = cache.get(path)
  if (hit !== undefined && hit.stamp === stamp) return hit.name
  const text = await $.fs.read(path).catch(() => '')
  const name = envName(text, config.variables)
  cache.set(path, { stamp, name })

  return name
}

async function scan($: EngineInterface) {
  const root = (await $.session.root()).replace(/\/+$/, '')
  const entries = await $.fs.list(root).catch(() => [])
  const names = byPrecedence(
    entries
      .filter(f => f.kind === 'file' || f.isLink)
      .map(f => f.name)
      .filter(n => isEnvFile(n) && !(config.ignoreTemplates && isTemplate(n))),
  ).slice(0, MAX_FILES)

  let name = ''
  for (const file of names) {
    const found = await nameIn($, `${root}/${file}`, file)
    if (found !== '') {
      name = found
      break
    }
  }
  const live = new Set(names.map(n => `${root}/${n}`))
  for (const path of cache.keys()) if (!live.has(path)) cache.delete(path)

  const fresh: EnvInfo | null = names.length > 0 ? { name, tone: toneOf(name), files: names } : null
  await setIfChanged(() => read($, info), v => update($, info, () => v), fresh)
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

const COLOR = { error: 'error', warning: 'warning', info: 'suggestion' } as const

// Opens a folder, file or address with the system's opener. Argument vector, no shell: the target is never parsed.
async function openTarget($: EngineInterface, args: string[]) {
  for (const program of ['open', 'xdg-open']) {
    try {
      // xdg-open has no reveal flag: it opens the folder of the file instead.
      const argv = program === 'open' ? [program, ...args] : [program, args[args.length - 1] ?? '']
      const res = await $.process.run(argv, { timeoutMs: 5_000 })
      if (res.exitCode === 0) return
    } catch {
      // This opener is not there; the next one tries.
    }
  }
  $.ui.toast(`Could not open ${args[args.length - 1] ?? ''}`)
}

// A click shows the file in the file manager (never opens its content).
async function reveal($: EngineInterface, file: string) {
  await openTarget($, ['-R', `${await $.session.root()}/${file}`])
}

export const register: Register = (on, options) => {
  config = { variables: parseVariables(String(options.variables ?? '')), ignoreTemplates: options.ignoreTemplates !== false }

  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  // Display only: Claude wrote a .env file, look again right away.
  on('tool.call', { tool: /^(Write|Edit|MultiEdit)$/ }, async ($, e, next) => {
    const ran = await next(e)
    const path = (e as { file_path?: unknown }).file_path
    if (typeof path === 'string' && isEnvFile(path.split('/').pop() ?? '')) await refresh($)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const env = await read($, info)
    if (env === null || env.files.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const isNarrow = e.props.bodyColumns < 44
    const color = COLOR[env.tone]
    const title = env.name !== '' ? `◉ ${env.name}` : '◉ Environment not set'
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm" gap="sm">
          <Text color="#39639E" size="caption">▌</Text>
          <Text size="caption" color={env.tone === 'info' ? undefined : color} weight="semibold">{title}</Text>
          {env.files.slice(0, isNarrow ? 1 : 4).map(file => (
            <Button key={`env-${file}`} plain onPress={() => void reveal($, file)}>
              <Text size="caption" dimColor>{file}</Text>
            </Button>
          ))}
        </Box>
        {below}
      </Box>
    )
  })
}
