import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderSurface } from 'claude-code'

import type { RuleEntry, RuleMap } from '../types'
import { columns, isNarrow } from './layout'
import { applyOps, asRules, ago, isSafe, isWorth, keyOf, rank, ruleOf, summaryOf } from './rules'
import type { Op } from './rules'
import { ACCENT, actions, emptyState, note, SPACE, TYPE } from './style'

const PANE = 'permission-log'
const STORE_KEY = 'permissions'

// Change the tag when RuleEntry's fields change: a value an earlier version stored is then declined.
const sessionRules = atom({ plugin: 'permission-log', key: 'sessionRules' } as const, {}, { shape: 'rules-1' })
const allRules = atom({ plugin: 'permission-log', key: 'allRules' } as const, {}, { shape: 'rules-1' })
const view = atom({ plugin: 'permission-log', key: 'permView' } as const, 'worth')
const scope = atom({ plugin: 'permission-log', key: 'permScope' } as const, 'session')
const opened = atom({ plugin: 'permission-log', key: 'permOpen' } as const, '')
const info = atom({ plugin: 'permission-log', key: 'permInfo' } as const, false)
const confirmReset = atom({ plugin: 'permission-log', key: 'permConfirm' } as const, false)
const lastNote = atom({ plugin: 'permission-log', key: 'permNote' } as const, null)

const NOTES = [
  'Counted from the moment this mod is installed. Calls your rules already allow are never asked, so they do not show here.',
  'A prompt counts as allowed when the tool ran after it, and as declined when the tool did not run or came back refused. That is read from the order of events, not from the dialog itself.',
  'A rule is worth allowing after 3 allowed prompts and no declined one. Rules come from the engine\'s own suggestion for the prompt.',
  'Copy puts the rule on the clipboard. Add it under permissions.allow in .claude/settings.json yourself; this mod changes no settings.',
  'Commands and file names are redacted for known key patterns; a rule that held a secret cannot be copied.',
]

// Prompts that were asked and wait for the tool to run (or not). Lost on a reload; at most MAX_WAITING.
type Waiting = { tool: string; example: string; rule: string }
const MAX_WAITING = 50
let waiting: Waiting[] = []

// Ops waiting to reach the store: written once per turn, at the end of the session, or when this many are waiting.
const FLUSH_AT = 40
let pending: Op[] = []

// Store writes one after another, so two reads of the store cannot overlap.
let queue: Promise<unknown> = Promise.resolve()
function inOrder(job: () => Promise<void>): Promise<void> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)

  return run
}

async function count($: EngineInterface, ops: Op[]) {
  if (ops.length === 0) return
  await update($, sessionRules, cur => applyOps(cur, ops))
  await update($, allRules, cur => applyOps(cur, ops))
  pending.push(...ops)
  if (pending.length >= FLUSH_AT) await flush($)
}

// Merges the waiting ops into the store: read fresh, so another session's counts stay.
async function flush($: EngineInterface) {
  const ops = pending
  pending = []
  if (ops.length === 0) return
  await inOrder(async () => {
    try {
      const total = applyOps(asRules(await $.store.get(STORE_KEY)), ops)
      await $.store.set(STORE_KEY, total)
      await update($, allRules, () => total)
    } catch (err) {
      pending = [...ops, ...pending].slice(-FLUSH_AT * 4)
      throw err
    }
  })
}

async function load($: EngineInterface) {
  await inOrder(async () => {
    const stored = asRules(await $.store.get(STORE_KEY))
    await update($, allRules, () => stored)
  })
}

// A person was asked: count the prompt and wait to see whether the tool ran.
async function asked($: EngineInterface, tool: string, input: unknown, suggestions: unknown) {
  const rule = ruleOf(tool, suggestions, input)
  const example = summaryOf(input)
  const at = await $.clock.now()
  waiting = [...waiting, { tool, example, rule }].slice(-MAX_WAITING)
  await count($, [{ kind: 'asked', rule, tool, example, at }])
}

// The tool ran (or came back refused) after a prompt for it.
async function settle($: EngineInterface, tool: string, input: unknown, ok: boolean) {
  const example = summaryOf(input)
  const i = waiting.findIndex(w => w.tool === tool && w.example === example)
  const w = waiting[i]
  if (w === undefined) return
  waiting = waiting.filter((_, j) => j !== i)
  await count($, [{ kind: ok ? 'allowed' : 'declined', rule: w.rule, tool: w.tool, example: '', at: await $.clock.now() }])
}

// Prompts the tool never followed up on were declined.
async function closeTurn($: EngineInterface) {
  const left = waiting
  waiting = []
  const at = await $.clock.now()
  await count($, left.map((w): Op => ({ kind: 'declined', rule: w.rule, tool: w.tool, example: '', at })))
  await flush($)
}

async function say($: EngineInterface, text: string, tone: 'success' | 'warning' | 'error') {
  await update($, lastNote, () => ({ text, tone }))
}

async function copyRule($: EngineInterface, e: RuleEntry, surface: RenderSurface) {
  if (!isSafe(e.rule)) return say($, 'Not copied: the rule held something that looks like a key.', 'warning')
  const copied = await $.ui.copy({ text: e.rule, surface })
  if (copied.isCopied) return say($, `Copied ${e.rule}. Add it under permissions.allow in .claude/settings.json.`, 'success')
  await say($, 'Clipboard unreachable: select and copy the rule above.', 'error')
}

async function disarm($: EngineInterface) {
  if (await read($, confirmReset)) await update($, confirmReset, () => false)
}

async function resetAll($: EngineInterface) {
  if (!(await read($, confirmReset))) return update($, confirmReset, () => true)
  pending = []
  await inOrder(async () => {
    await $.store.set(STORE_KEY, {})
    await update($, allRules, () => ({}))
    await update($, confirmReset, () => false)
  })
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

const cut = (text: string, room: number) => (text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'permlog', description: 'Show which permission prompts you allowed or declined, in a pane' })
    try {
      await load($)
    } catch {
      // Only the all-sessions numbers are missing; the session counts still work.
    }

    return next(e)
  })

  on('command.run', { command: 'permlog' }, async $ => {
    await disarm($).catch(() => undefined)
    const res = await $.ui.open({ id: PANE, title: 'Permissions' })

    return { text: res.isPlaced ? 'Permission log opened.' : 'Permission log: the pane is waiting for room.' }
  })

  // A person is asked: observe only, the answer stays the engine's.
  on('classic.PermissionRequest', async ($, e, next) => {
    try {
      await asked($, e.tool_name, e.tool_input, e.permission_suggestions)
    } catch {
      // Only the log misses it.
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Refused without a person (a rule or the auto-mode classifier): counted as asked and declined.
  on('classic.PermissionDenied', async ($, e, next) => {
    try {
      const at = await $.clock.now()
      await count($, [{ kind: 'refused', rule: ruleOf(e.tool_name, undefined, e.tool_input), tool: e.tool_name, example: summaryOf(e.tool_input), at }])
    } catch {
      // Only the log misses it.
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // The tool ran after a prompt: allowed. Cheap when nothing waits.
  on('tool.call', async ($, e, next) => {
    let ran: Awaited<ReturnType<typeof next>> | null = null
    try {
      ran = await next(e)
    } finally {
      if (waiting.length > 0 && typeof e.tool === 'string') {
        try {
          const ok = ran !== null && typeof ran.deny !== 'string' && ran.isError !== true
          await settle($, e.tool, e, ok)
        } catch {
          // The call's result stands; only the log misses it.
        }
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      await closeTurn($)
    } catch {
      // Tried again at the next turn.
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      await closeTurn($)
    } catch {
      // The session is ending; this turn's counts are lost.
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui: Ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const v = await read($, view)
    const sc = await read($, scope)
    const open = await read($, opened)
    const infoOpen = await read($, info)
    const armed = await read($, confirmReset)
    const told = await read($, lastNote)
    const map: RuleMap = sc === 'all' ? await read($, allRules) : await read($, sessionRules)
    const now = await $.clock.now()
    const narrow = isNarrow(e as unknown as RenderInput)
    const width = columns(e as unknown as RenderInput)
    const room = Math.max(8, width - 18)

    const all = Object.values(map)
    const worthCount = all.filter(isWorth).length
    const list = rank(map, v)

    const row = (x: RuleEntry) => {
      const k = keyOf(x.rule)
      const isOpen = open === k

      return (
        <Box key={`e-${k}`} flexDirection="column">
          <Box alignItems="center" gap={SPACE.tight}>
            <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Button key={`t-${k}`} plain onPress={() => update($, opened, now2 => (now2 === k ? '' : k))}>
                {isOpen ? '▾' : '▸'} {cut(x.rule, room)}
              </Button>
            </Box>
            <Box width={narrow ? 8 : 11} flexShrink={0} justifyContent="flex-end">
              <Text tabular size={TYPE.label}>{`${x.allowed}✓ ${x.declined}✗`}</Text>
            </Box>
          </Box>
          {isOpen && (
            <Box key={`d-${k}`} flexDirection="column" marginLeft="sm" marginY="xs" paddingX="sm" borderStyle="round" overflow="hidden" borderColor="subtle">
              {x.example !== '' && <Text key="ex" mono size={TYPE.label} wrap="wrap">{x.example}</Text>}
              <Text key="n" dimColor size={TYPE.label} wrap="wrap">{`asked ${x.asked}× · allowed ${x.allowed}× · declined ${x.declined}× · last ${ago(now, x.last)} ago`}</Text>
              {x.declined > 0 && <Text key="w" color="warning" size={TYPE.label} wrap="wrap">You declined this before, so it is not suggested.</Text>}
              {actions(ui, 'act', [<Button key="copy" label="⧉ copy rule" variant="secondary" onPress={press => copyRule($, x, press.surface)} />])}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
        <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
          <Box flexShrink={0}>
            <Text size={TYPE.title} weight="semibold">Permissions</Text>
          </Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end" gap={SPACE.base}>
            <Text dimColor size={TYPE.label} wrap="truncate">{`${all.length} rules`}</Text>
            <Button key="scope" plain onPress={() => disarm($).then(() => update($, scope, s => (s === 'all' ? 'session' : 'all')))}>
              <Text size={TYPE.label} color={ACCENT} weight="semibold">{sc === 'all' ? 'all sessions' : 'this session'}</Text>
            </Button>
          </Box>
        </Box>
        <Box key="views" gap={SPACE.base} flexWrap="wrap">
          {[
            { id: 'worth', label: `★ Worth allowing ${worthCount}` },
            { id: 'all', label: `All asked ${all.length}` },
          ].map(x => (
            <Button key={`view-${x.id}`} plain onPress={() => update($, view, () => x.id)}>
              <Text size={TYPE.body} weight={x.id === v ? 'bold' : 'regular'} color={x.id === v ? ACCENT : undefined}>{x.label}</Text>
            </Button>
          ))}
        </Box>
        {told !== null && note(ui, 'note', told.text, told.tone)}
        {list.length === 0 &&
          emptyState(
            ui,
            'empty',
            v === 'worth' ? '★' : '∅',
            v === 'worth' ? 'Nothing yet. A rule shows here after 3 allowed prompts and no declined one.' : 'No permission prompt yet.',
          )}
        {list.length > 0 && (
          <Box key="list" flexDirection="column" gap={SPACE.tight}>
            {list.map(row)}
          </Box>
        )}
        <Box key="info-row">
          <Button key="info" plain onPress={() => update($, info, o => !o)}>
            <Text size={TYPE.label} color={ACCENT}>{infoOpen ? 'ⓘ hide notes' : 'ⓘ About these numbers'}</Text>
          </Button>
        </Box>
        {infoOpen && (
          <Box key="notes" flexDirection="column" gap={SPACE.tight} borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs">
            {NOTES.map((n, i) => (
              <Text key={`n${i}`} dimColor size={TYPE.label} wrap="wrap">{`• ${n}`}</Text>
            ))}
          </Box>
        )}
        {sc === 'all' &&
          actions(ui, 'tools-row', [
            <Button key="reset" label={armed ? 'Really reset all counts?' : 'Reset all'} variant="secondary" onPress={() => resetAll($)} />,
            ...(armed ? [<Button key="cancel" label="Cancel" variant="secondary" onPress={() => update($, confirmReset, () => false)} />] : []),
          ])}
      </Box>
    )
  })
}
