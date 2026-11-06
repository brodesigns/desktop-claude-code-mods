import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BranchName } from '../types'
import { isProtected, parsePatterns } from './match'
import { setIfChanged } from './state'

const current = atom({ plugin: 'branch-guard-band', key: 'branch' } as const, null)

const POLL_MS = 15_000

let timer: { cancel: () => void } | null = null

// `symbolic-ref` names the branch, also one with no commit yet; detached HEAD or no repository exits non-zero.
// A missing git binary makes process.run throw: no branch either. No optional locks, so the poll never blocks git.
async function refresh($: EngineInterface) {
  let branch: BranchName = null
  try {
    const res = await $.process.run(['git', '-c', 'core.fsmonitor=false', '--no-optional-locks', 'symbolic-ref', '--quiet', 'HEAD'], { timeoutMs: 5_000 })
    // Without --short: with a tag of the same name, --short answers `heads/main` and the guard would miss it.
    const name = res.stdout.trim().replace(/^refs\/heads\//, '')
    if (res.exitCode === 0 && name !== '') branch = name
  } catch {
    branch = null
  }
  try {
    await setIfChanged(() => read($, current), v => update($, current, () => v), branch)
  } catch {
    // Tried again on the next poll.
  }
}

async function start($: EngineInterface) {
  timer?.cancel()
  timer = $.clock.every(POLL_MS, () => { refresh($).catch(() => undefined) })
  refresh($).catch(() => undefined)
}

export const register: Register = (on, options) => {
  const patterns = parsePatterns(String(options.branches ?? 'main,master'))
  const showHint = options.hint !== false

  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  // Display only: a git command Claude ran may have switched the branch, so look again right after it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgit\b/.test(String(e.command))) await refresh($)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const branch = await read($, current)
    if (branch === null || !isProtected(branch, patterns)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const isNarrow = e.props.bodyColumns < 44
    const below = await next(e)

    // One borderless row; a click copies the command that leaves the branch.
    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm" gap="sm">
          <Box flexShrink={0}><Text color="#39639E" size="caption">▌</Text></Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Button key="guard" plain onPress={press => {
              $.ui.copy({ text: 'git switch -c ', surface: press.surface }).catch(() => undefined)
              $.ui.toast('Copied "git switch -c ", add a branch name')
            }}>
              <Text size="caption" color="warning" weight="semibold" wrap="truncate">{`⚠ Working directly on ${branch}`}</Text>
              {showHint && !isNarrow ? <Text size="caption" dimColor wrap="truncate">{' · click to copy: git switch -c'}</Text> : ''}
            </Button>
          </Box>
        </Box>
        {below}
      </Box>
    )
  })
}
