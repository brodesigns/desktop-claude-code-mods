import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { GitInfo } from '../types'
import { isNarrow } from './layout'
import { loadProject } from './project'
import { isOn } from './settings'
import { setIfChanged } from './state'
import { PANE } from './pane'
import { pill, SPACE, TYPE } from './style'

const info = atom({ plugin: 'bro-cockpit', key: 'gitInfo' } as const, null)

const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? ''

// porcelain v1: XY per file; X is the index (staged), Y the work tree; "??" is untracked.
const parse = (stdout: string, project: string): GitInfo => {
  const [head = '', ...files] = stdout.split('\n').filter(line => line !== '')
  const branch = head.replace(/^## /, '').replace(/^No commits yet on /, '').split('...')[0] ?? ''
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
let known = { cwd: '', project: '' }
let timer: { cancel: () => void } | null = null

async function refresh($: EngineInterface) {
  let project = known.project
  try {
    const cwd = await $.session.cwd()
    if (cwd !== known.cwd) {
      project = await projectOf($)
      // The project tab loads in any case, with the folder name when git gave nothing.
      try {
        const name = project !== '' ? project : baseName(await $.session.root())
        if (name !== '') await loadProject($, name)
        known = { cwd, project }
      } catch {
        // Nothing to show; the project tab says so. Tried again on the next poll.
      }
    }
    const res = await git($, ['status', '--porcelain', '-b'], 10_000)
    const fresh: GitInfo = res !== null && res.exitCode === 0 ? parse(res.stdout, project) : { project, ...EMPTY }
    await setIfChanged(() => read($, info), v => update($, info, () => v), fresh)
  } catch {
    await setIfChanged(() => read($, info), v => update($, info, () => v), null)
  }
}

// Every 15 s, also with the pane closed: the band above the prompt shows this.
export async function start($: EngineInterface) {
  void refresh($)
  timer?.cancel()
  timer = $.clock.every(15_000, () => void refresh($))
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

    // One borderless row; a click opens the cockpit pane.
    return (
      <Box flexDirection="column">
        <Box overflow="hidden" paddingX="sm">
          <Button key="gitband" plain onPress={() => void $.ui.open({ id: PANE, title: 'Cockpit', focus: true })}>
            <Text color="#22d3ee" weight="semibold">{`▣ ${git.project}`}</Text>
            {isRepo ? <Text color="#22d3ee">{` ⎇ ${git.branch}`}</Text> : ''}
            {isRepo ? <Text color={state.tone} weight="semibold">{`  ${state.text}`}</Text> : ''}
            {git.ahead > 0 ? <Text color="permission">{narrow ? `  ↑${git.ahead}` : `  ↑ ${git.ahead} to push`}</Text> : ''}
            {git.behind > 0 ? <Text color="warning">{narrow ? `  ↓${git.behind}` : `  ↓ ${git.behind} to pull`}</Text> : ''}
          </Button>
        </Box>
        {below}
      </Box>
    )
  })
}
