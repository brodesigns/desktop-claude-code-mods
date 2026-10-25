import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { GitInfo } from '../types'
import { branchUrl, commitsUrl } from './git-url'
import { openTarget } from './open'
import { isNarrow } from './layout'
import { loadProject } from './project'
import { isOn } from './settings'
import { setIfChanged } from './state'
import { PANE } from './pane'
import { pill, SPACE, TYPE } from './style'

const info = atom({ plugin: 'bro-cockpit', key: 'gitInfo' } as const, null)

const DETACHED = 'detached'

const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? ''

// porcelain v1: XY per file; X is the index (staged), Y the work tree; "??" is untracked.
const parse = (stdout: string, project: string): GitInfo => {
  const [head = '', ...files] = stdout.split('\n').filter(line => line !== '')
  const name = head.replace(/^## /, '').replace(/^No commits yet on /, '').split('...')[0] ?? ''
  // A checked-out commit has no branch: git prints "HEAD (no branch)", which has no page on the remote.
  const branch = /^HEAD \(no branch\)/.test(name) ? DETACHED : name
  const ahead = Number(head.match(/ahead (\d+)/)?.[1] ?? 0)
  const behind = Number(head.match(/behind (\d+)/)?.[1] ?? 0)
  const untracked = files.filter(l => l.startsWith('??')).length
  const staged = files.filter(l => !l.startsWith('??') && l[0] !== ' ').length
  const modified = files.filter(l => !l.startsWith('??') && l[1] !== ' ').length

  return { project, branch, changed: files.length, staged, modified, untracked, ahead, behind }
}

// Every git call skips optional locks, so the 15 s poll never fights a git command running in the project.
// A missing git binary makes process.run throw; that counts as "no repository".
async function git($: EngineInterface, args: string[], timeoutMs: number) {
  try {
    return await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs })
  } catch {
    return null
  }
}

// The project is the main repository's folder name, also from inside a worktree. Without git: the folder name.
async function projectOf($: EngineInterface) {
  const common = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'], 5_000)
  if (common !== null && common.exitCode === 0) {
    const dir = common.stdout.trim()
    return baseName(dir.endsWith('/.git') ? dir.slice(0, -5) : dir)
  }

  return baseName(await $.session.cwd())
}

const EMPTY = { branch: '', changed: 0, staged: 0, modified: 0, untracked: 0, ahead: 0, behind: 0 }

// The project (main repo folder) does not change per poll: found once, again only after the session's
// directory moved. A poll is then one `git status` instead of `rev-parse` plus `status`.
let known = { cwd: '', project: '', remote: '' }
let timer: { cancel: () => void } | null = null
let isRefreshing = false
let isDue = false

// One look at a time; a request while one runs makes it go round once more, so a change right after the
// look began is not missed.
async function refresh($: EngineInterface) {
  if (isRefreshing) {
    isDue = true
    return
  }
  isRefreshing = true
  try {
    do {
      isDue = false
      await look($)
    } while (isDue)
  } finally {
    isRefreshing = false
  }
}

async function look($: EngineInterface) {
  let project = known.project
  let remote = known.remote
  try {
    const cwd = await $.session.cwd()
    if (cwd !== known.cwd) {
      project = await projectOf($)
      const origin = await git($, ['remote', 'get-url', 'origin'], 5_000)
      remote = origin !== null && origin.exitCode === 0 ? origin.stdout.trim() : ''
      // The project tab loads in any case, with the folder name when git gave nothing.
      try {
        const name = project !== '' ? project : baseName(await $.session.root())
        if (name !== '') await loadProject($, name)
        known = { cwd, project, remote }
      } catch {
        // Nothing to show; the project tab says so. Tried again on the next poll.
      }
    }
    const res = await git($, ['status', '--porcelain', '-b'], 10_000)
    const fresh: GitInfo = res !== null && res.exitCode === 0 ? { ...parse(res.stdout, project), remote } : { project, ...EMPTY }
    await setIfChanged(() => read($, info), v => update($, info, () => v), fresh)
  } catch {
    await setIfChanged(() => read($, info), v => update($, info, () => v), null)
  }
}

// After Claude ran something that can move the repository (a command, a file write), the band follows at once
// instead of at the next poll. Display only: nothing waits for it.
export function gitTouched($: EngineInterface, tool: string) {
  if (/^(Bash|Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) void refresh($).catch(() => undefined)
}

// Every 15 s, also with the pane closed: the band above the prompt shows this.
export async function start($: EngineInterface) {
  void refresh($).catch(() => undefined)
  timer?.cancel()
  timer = $.clock.every(15_000, () => void refresh($).catch(() => undefined))
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

// Short words on a narrow pane, full words otherwise; the mark carries the state without colour.
const statusPill = (ui: Ui, git: GitInfo, narrow: boolean) =>
  git.changed > 0
    ? pill(ui, 'st', narrow ? `● ${git.changed} open` : `● ${git.changed} ${git.changed === 1 ? 'change' : 'changes'}`, 'warning')
    : pill(ui, 'st', narrow ? '✓ clean' : '✓ All committed', 'success')

// The project and branch line in the pane's head.
export async function line($: EngineInterface, e: RenderInput) {
  const git = await read($, info)
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  if (git === null) return <Text dimColor size={TYPE.body}>○ no project</Text>
  const narrow = isNarrow(e)

  return (
    <Box alignItems="center" gap={SPACE.tight} flexWrap="wrap" minWidth={0}>
      <Box flexShrink={1} minWidth={0} overflow="hidden">
        <Text weight="semibold" size={TYPE.body} wrap="truncate">▣ {git.project}</Text>
      </Box>
      {git.branch !== '' && pill(ui, 'br', `⎇ ${git.branch}`, 'info', true)}
      {git.branch !== '' && statusPill(ui, git, narrow)}
    </Box>
  )
}

async function openFolder($: EngineInterface) {
  await openTarget($, await $.session.root())
}

// The branch on GitHub when the remote is a GitHub one; otherwise the branch name goes to the clipboard.
async function openBranch($: EngineInterface, git: GitInfo, surface: RenderSurface, commits = false) {
  if (git.branch === DETACHED) {
    await $.ui.copy({ text: 'git rev-parse --short HEAD', surface })
    $.ui.toast('Detached HEAD, no branch page. Copied: git rev-parse --short HEAD')
    return
  }
  const url = (commits ? commitsUrl : branchUrl)(git.remote ?? '', git.branch)
  if (url !== null) return openTarget($, url)
  await $.ui.copy({ text: git.branch, surface })
  $.ui.toast(`No GitHub remote. Copied ${git.branch}`)
}

// Unpushed commits are not on the remote, so there is no page for them: the command that pushes them is copied.
async function copyPush($: EngineInterface, surface: RenderSurface) {
  await $.ui.copy({ text: 'git push', surface })
  $.ui.toast('Copied: git push')
}

export const register: Register = (on, options) => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn(options, 'gitband')) return next(e)
    const git = await read($, info)
    if (e.props.hasSurvey || git === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const narrow = isNarrow(e as unknown as RenderInput)
    const isRepo = git.branch !== ''
    // The bands of other mods draw beneath this one; returning without them would hide them.
    const below = await next(e)
    const state = git.changed > 0
      ? { tone: 'warning', text: narrow ? `● ${git.changed}` : `● ${git.changed} ${git.changed === 1 ? 'change' : 'changes'}${git.staged > 0 ? ` (${git.staged} staged)` : ''}` }
      : { tone: 'success', text: narrow ? '✓' : '✓ All committed' }

    // One borderless row, every part its own button: the project opens its folder, the branch its GitHub page,
    // the state the cockpit.
    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm" gap="sm">
          <Box flexShrink={0}>
            <Text color="#39639E" size="caption">▌</Text>
          </Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Button key="gitband-project" plain onPress={() => void openFolder($)}>
              <Text size="caption" weight="semibold" wrap="truncate">{`▣ ${git.project}`}</Text>
            </Button>
          </Box>
          {isRepo && (
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              <Button key="gitband-branch" plain onPress={press => void openBranch($, git, press.surface)}>
                <Text size="caption" wrap="truncate">{`⎇ ${git.branch}`}</Text>
              </Button>
            </Box>
          )}
          {isRepo && (
            <Box flexShrink={0}>
              <Button key="gitband-state" plain onPress={() => void $.ui.open({ id: PANE, title: 'Cockpit', focus: true })}>
                <Text size="caption" color={state.tone} weight="semibold">{state.text}</Text>
              </Button>
            </Box>
          )}
          {git.ahead > 0 && (
            <Box flexShrink={0}>
              <Button key="gitband-ahead" plain onPress={press => void copyPush($, press.surface)}>
                <Text size="caption" color="permission">{narrow ? `↑${git.ahead}` : `↑ ${git.ahead} to push`}</Text>
              </Button>
            </Box>
          )}
          {git.behind > 0 && (
            <Box flexShrink={0}>
              <Button key="gitband-behind" plain onPress={press => void openBranch($, git, press.surface, true)}>
                <Text size="caption" color="warning">{narrow ? `↓${git.behind}` : `↓ ${git.behind} to pull`}</Text>
              </Button>
            </Box>
          )}
        </Box>
        {below}
      </Box>
    )
  })
}
