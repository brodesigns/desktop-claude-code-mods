import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import { ASK_MAX, bullets, buildPrompt, clip, digestTurn, parseSummary, SYSTEM, tokensWord, WAITING_MAX } from './digest'
import { redact } from './keys'
import { isNarrow } from './layout'
import { emptyState, note, SPACE, TYPE } from './style'

const PANE = 'session-summary'

const summary = atom({ plugin: 'session-summary', key: 'summary' } as const, null)
const waiting = atom({ plugin: 'session-summary', key: 'waiting' } as const, [])
const lastAsk = atom({ plugin: 'session-summary', key: 'lastAsk' } as const, '')
const lastFiles = atom({ plugin: 'session-summary', key: 'lastFiles' } as const, [])
const isBusy = atom({ plugin: 'session-summary', key: 'isBusy' } as const, false)
const told = atom({ plugin: 'session-summary', key: 'summaryNote' } as const, null)
// The pane's switch for the automatic updates: null until the person (or a saved choice) sets it, then the setting `auto` applies.
const autoOn = atom({ plugin: 'session-summary', key: 'autoOn' } as const, null)

const STORE_KEY = 'session-summary:auto'

// From userConfig; a reload brings a changed value.
let model = 'haiku'
// The setting `auto`: what holds while no choice was made in the pane.
let isAuto = true
// One update at a time; a turn that ends while one runs makes it go round once more.
let isRunning = false
let isDue = false

const baseName = (path: string) => path.split('/').pop() ?? path

// One call to the cheap model: the summary so far plus the digests of the turns it does not know yet.
// Nothing leaves the session's own client and credentials; text is redacted before it is sent or kept.
async function summarize($: EngineInterface) {
  if (isRunning) {
    isDue = true
    return
  }
  isRunning = true
  try {
    do {
      isDue = false
      const digests = await read($, waiting)
      if (digests.length === 0) break
      await update($, isBusy, () => true)
      const before = await read($, summary)
      const reply = await $.model.complete({
        model,
        system: SYSTEM,
        prompt: buildPrompt(before?.text ?? '', digests),
        maxTokens: 220,
        effort: 'low',
        timeoutMs: 30_000,
      })
      if (!reply.isAnswered) {
        const why = reply.reason === 'api-error' ? `API error${reply.status === null ? '' : ` ${reply.status}`}` : reply.reason
        await update($, told, () => ({ text: `Not updated: ${why}. Press "update now" to try again.`, tone: 'warning' as const }))
        break
      }
      const text = parseSummary(redact(reply.text))
      if (text === '') {
        await update($, told, () => ({ text: 'The model sent no usable summary.', tone: 'warning' as const }))
        break
      }
      const spent = reply.usage.input_tokens + reply.usage.output_tokens
      await update($, summary, cur => ({ text, turns: (cur?.turns ?? 0) + digests.length, tokens: (cur?.tokens ?? 0) + spent }))
      // Only the digests this call covered are done; ones that arrived meanwhile stay.
      await update($, waiting, list => list.slice(digests.length))
      await update($, told, () => null)
    } while (isDue)
  } catch {
    await update($, told, () => ({ text: 'Not updated: the model call failed. Press "update now" to try again.', tone: 'warning' as const }))
  } finally {
    isRunning = false
    await update($, isBusy, () => false)
  }
}

// The pane's choice wins over the setting; it is kept across sessions.
async function isAutomatic($: EngineInterface): Promise<boolean> {
  return (await read($, autoOn)) ?? isAuto
}

async function toggleAuto($: EngineInterface) {
  const next = !(await isAutomatic($))
  await update($, autoOn, () => next)
  try {
    await $.store.set(STORE_KEY, next)
  } catch {
    // The choice holds for this session even when it cannot be kept.
  }
  // Switching on with turns waiting: catch up now instead of at the next answer.
  if (next && (await read($, waiting)).length > 0) void summarize($)
}

// A finished turn of the main thread becomes one digest.
async function recordTurn($: EngineInterface, answer: string) {
  const ask = await read($, lastAsk)
  const files = await read($, lastFiles)
  const digest = digestTurn(ask, files, redact(answer))
  await update($, waiting, list => [...list, digest].slice(-WAITING_MAX))
  await update($, lastAsk, () => '')
  await update($, lastFiles, () => [])
  if (await isAutomatic($)) void summarize($)
}

export const register: Register = (on, options) => {
  const wanted = String(options.model ?? '').trim()
  model = wanted === '' ? 'haiku' : wanted
  isAuto = options.auto !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'summary', description: 'Open the pane with the short summary of this session' })
    try {
      const saved = await $.store.get(STORE_KEY)
      if (typeof saved === 'boolean') await update($, autoOn, () => saved)
    } catch {
      // No saved choice: the setting applies.
    }
    void $.ui.open({ id: PANE, title: 'Summary' })

    return next(e)
  })

  on('command.run', { command: 'summary' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Summary' })

    return { text: 'Summary pane opened.' }
  })

  // What the person asked: kept until the turn ends. Typed commands are no work to summarise.
  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined) await update($, lastAsk, () => clip(redact(e.text), ASK_MAX))

    return next(e)
  })

  // Display only: the files this turn wrote, by name.
  on('tool.call', { tool: /^(Write|Edit|MultiEdit|NotebookEdit)$/ }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true && e.agentId === undefined) {
      const input = e as unknown as { file_path?: unknown; notebook_path?: unknown }
      const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
      if (path !== '') await update($, lastFiles, list => (list.includes(baseName(path)) ? list : [...list, baseName(path)].slice(-12)))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && e.reason === 'answer') await recordTurn($, e.answer)

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => view($, e))
}

async function pressUpdate($: EngineInterface) {
  await update($, told, () => null)
  await summarize($)
}

export async function view($: EngineInterface, e: RenderInput) {
  const ui = $.ui.resolve(e)
  const { Box, Button, Text } = ui
  const narrow = isNarrow(e)
  const data = await read($, summary)
  const queue = await read($, waiting)
  const busy = await read($, isBusy)
  const message = await read($, told)
  const automatic = (await read($, autoOn)) ?? isAuto

  return (
    <Box flexDirection="column" gap={SPACE.base} padding={narrow ? 'xs' : 'sm'}>
      <Box justifyContent="space-between" alignItems="center" gap={SPACE.base}>
        <Box flexShrink={0}>
          <Text size={TYPE.title} weight="semibold">Summary</Text>
        </Box>
        <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end" gap={SPACE.base}>
          <Text dimColor size={TYPE.label} wrap="truncate">
            {busy ? 'updating …' : data === null ? model : `${data.turns} ${data.turns === 1 ? 'turn' : 'turns'} · ${model} · ${tokensWord(data.tokens)} tokens`}
          </Text>
          <Button key="auto" plain onPress={() => toggleAuto($)}>
            <Text size={TYPE.label} color={automatic ? '#39639E' : undefined} dimColor={!automatic} weight="semibold">{automatic ? '● auto' : '○ auto off'}</Text>
          </Button>
          {(queue.length > 0 || data === null) && !busy && (
            <Button key="update" plain onPress={() => pressUpdate($)}>
              <Text size={TYPE.label} color="#39639E" weight="semibold">↻ update</Text>
            </Button>
          )}
        </Box>
      </Box>

      {message !== null && note(ui, 'note', message.text, message.tone)}

      {data === null
        ? emptyState(ui, 'empty', '≡', automatic ? 'Nothing yet. The summary appears after the first answer.' : 'Automatic updates are off. Switch them on above or press "↻ update" after a few turns.')
        : bullets(data.text).map((line, i) => (
            <Box key={`b-${i}`} gap={SPACE.base} minWidth={0} overflow="hidden">
              <Box flexShrink={0}>
                <Text size={TYPE.body} color="#39639E" weight="semibold">•</Text>
              </Box>
              <Box flexShrink={1} minWidth={0} overflow="hidden">
                <Text size={TYPE.body} wrap="wrap">{line}</Text>
              </Box>
            </Box>
          ))}
      {data !== null && queue.length > 0 && !busy && (
        <Text dimColor size={TYPE.label}>{`${queue.length} newer ${queue.length === 1 ? 'turn' : 'turns'} not included yet${automatic ? '' : ' (auto is off)'}`}</Text>
      )}
    </Box>
  )
}
