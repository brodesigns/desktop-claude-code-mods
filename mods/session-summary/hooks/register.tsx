import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import { ASK_MAX, bullets, buildPrompt, cleanLanguage, clip, digestTurn, isReady, isTrivial, LANGUAGES, MAX_TOKENS, parseSummary, RESTATE_SYSTEM, systemFor, tokensWord, WAITING_MAX } from './digest'
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

// The pane's language choice: null until set, then the setting `language` applies.
const languageNow = atom({ plugin: 'session-summary', key: 'languageNow' } as const, null)

const STORE_KEY = 'session-summary:auto'
const LANGUAGE_KEY = 'session-summary:language'

// From userConfig; a reload brings a changed value.
let model = 'haiku'
// The setting `auto`: what holds while no choice was made in the pane.
let isAuto = true
// The setting `language`: what holds while no choice was made in the pane.
let settingLanguage = 'English'
// One update at a time; a turn that ends while one runs makes it go round once more.
let isRunning = false
let isDue = false
// A permanent API error (wrong model, no access): no automatic calls until the person presses `update` or switches auto off and on.
let isPaused = false
// Numbers the digests, so a call removes exactly the ones it covered even when the list was trimmed meanwhile.
let turnNo = 0
// When the last worthwhile turn ended (clock time): the idle wait before a batch is sent counts from it.
let lastTurnAt = 0
let timer: { cancel: () => void } | null = null

const PERMANENT = ['invalid_request', 'authentication_failed', 'model_not_found']

const baseName = (path: string) => path.split('/').pop() ?? path

// Writes the note only when it is not there already (no redraw for nothing).
async function clearNote($: EngineInterface) {
  if ((await read($, told)) !== null) await update($, told, () => null)
}

// One call to the cheap model: the summary so far plus the digests of the turns it does not know yet.
// Nothing leaves the session's own client and credentials; text is redacted before it is sent or kept.
async function summarize($: EngineInterface) {
  if (isRunning) {
    isDue = true
    return
  }
  isRunning = true
  let isMarked = false
  try {
    do {
      isDue = false
      const digests = await read($, waiting)
      if (digests.length === 0) break
      if (!isMarked) {
        await update($, isBusy, () => true)
        isMarked = true
      }
      const lastSentN = digests[digests.length - 1]?.n ?? 0
      const before = await read($, summary)
      const reply = await $.model.complete({
        model,
        system: systemFor(await currentLanguage($)),
        prompt: buildPrompt(before?.text ?? '', digests.map(d => d.text)),
        maxTokens: MAX_TOKENS,
        effort: 'low',
        timeoutMs: 30_000,
      })
      if (!reply.isAnswered) {
        const why = reply.reason === 'api-error' ? `API error${reply.status === null ? '' : ` ${reply.status}`}` : reply.reason
        if (reply.reason === 'api-error' && PERMANENT.includes(reply.error)) {
          isPaused = true
          await update($, told, () => ({ text: `Not updated: ${why} (${reply.error}). Check the model setting; auto paused for this session.`, tone: 'warning' as const }))
        } else {
          await update($, told, () => ({ text: `Not updated: ${why}. Press "update now" to try again.`, tone: 'warning' as const }))
        }
        break
      }
      const text = parseSummary(redact(reply.text))
      if (text === '') {
        await update($, told, () => ({ text: 'The model sent no usable summary.', tone: 'warning' as const }))
        break
      }
      const spent = reply.usage.input_tokens + reply.usage.output_tokens
      await update($, summary, cur => ({ text, turns: (cur?.turns ?? 0) + digests.length, tokens: (cur?.tokens ?? 0) + spent }))
      // Only the digests this call covered are done; ones that arrived meanwhile stay, even if the list was trimmed.
      await update($, waiting, list => list.filter(d => d.n > lastSentN))
      await clearNote($)
    } while (isDue)
  } catch {
    await update($, told, () => ({ text: 'Not updated: the model call failed. Press "update now" to try again.', tone: 'warning' as const }))
  } finally {
    isRunning = false
    if (isMarked) await update($, isBusy, () => false)
  }
}

// The pane's choice wins over the setting; it is kept across sessions.
async function currentLanguage($: EngineInterface): Promise<string> {
  return (await read($, languageNow)) ?? settingLanguage
}

// The next language in the list (the setting's own one first when it is not in the list).
async function nextLanguage($: EngineInterface) {
  const all: string[] = [...LANGUAGES]
  if (!all.includes(settingLanguage)) all.unshift(settingLanguage)
  const now = await currentLanguage($)
  const next = all[(Math.max(0, all.indexOf(now)) + 1) % all.length] ?? 'English'
  await update($, languageNow, () => next)
  try {
    await $.store.set(LANGUAGE_KEY, next)
  } catch {
    // The choice holds for this session even when it cannot be kept.
  }
  await restate($, next)
}

// A summary that exists is written again in the new language, from its own text (a few dozen tokens).
// Skipped while an update runs: that one writes in the language it started with, the next one in the new.
async function restate($: EngineInterface, language: string) {
  const current = await read($, summary)
  if (current === null || isRunning) return
  isRunning = true
  try {
    await update($, isBusy, () => true)
    const reply = await $.model.complete({ model, system: RESTATE_SYSTEM(language), prompt: `<summary>\n${current.text.replace(/[<>]/g, '')}\n</summary>`, maxTokens: MAX_TOKENS, effort: 'low', timeoutMs: 30_000 })
    const text = reply.isAnswered ? parseSummary(redact(reply.text)) : ''
    if (reply.isAnswered && text !== '') {
      const spent = reply.usage.input_tokens + reply.usage.output_tokens
      await update($, summary, cur => (cur === null ? cur : { ...cur, text, tokens: cur.tokens + spent }))
    } else {
      await update($, told, () => ({ text: `Not rewritten in ${language}: the next update will use it.`, tone: 'warning' as const }))
    }
  } catch {
    await update($, told, () => ({ text: `Not rewritten in ${language}: the next update will use it.`, tone: 'warning' as const }))
  } finally {
    isRunning = false
    await update($, isBusy, () => false)
  }
}

async function isAutomatic($: EngineInterface): Promise<boolean> {
  return (await read($, autoOn)) ?? isAuto
}

async function toggleAuto($: EngineInterface) {
  const next = !(await isAutomatic($))
  isPaused = false
  await update($, autoOn, () => next)
  try {
    await $.store.set(STORE_KEY, next)
  } catch {
    // The choice holds for this session even when it cannot be kept.
  }
  // Switching on with turns waiting: catch up now instead of at the next answer.
  if (next && (await read($, waiting)).length > 0) void summarize($)
}

// Whether the pane is placed; an unreadable answer counts as "yes" so a failing check never silences the summary.
async function isPaneUp($: EngineInterface) {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
  } catch {
    return true
  }
}

// The automatic call, only when it pays: auto on, not paused, the pane open (a closed pane needs no summary, the
// waiting turns are caught up in one call when it opens), and enough waiting (a batch, or a quiet minute and a half).
async function maybeSummarize($: EngineInterface) {
  if (isPaused || !(await isAutomatic($))) return
  const queue = await read($, waiting)
  if (queue.length === 0) return
  const hasSummary = (await read($, summary)) !== null
  if (!isReady(queue.length, hasSummary, (await $.clock.now()) - lastTurnAt)) return
  if (await isPaneUp($)) void summarize($)
}

// A finished turn of the main thread becomes one digest, unless it adds nothing.
async function recordTurn($: EngineInterface, answer: string) {
  const ask = await read($, lastAsk)
  const files = await read($, lastFiles)
  await update($, lastAsk, () => '')
  await update($, lastFiles, () => [])
  if (isTrivial(files, answer)) return
  const digest = digestTurn(ask, files, redact(answer))
  turnNo += 1
  const n = turnNo
  lastTurnAt = await $.clock.now()
  await update($, waiting, list => [...list, { n, text: digest }].slice(-WAITING_MAX))
  await maybeSummarize($)
}

export const register: Register = (on, options) => {
  const wanted = String(options.model ?? '').trim()
  model = wanted === '' ? 'haiku' : wanted
  isAuto = options.auto !== false
  settingLanguage = cleanLanguage(options.language)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'summary', description: 'Open the pane with the short summary of this session' })
    try {
      const saved = await $.store.get(STORE_KEY)
      if (typeof saved === 'boolean') await update($, autoOn, () => saved)
      const lang = await $.store.get(LANGUAGE_KEY)
      if (typeof lang === 'string') await update($, languageNow, () => cleanLanguage(lang))
    } catch {
      // No saved choice: the setting applies.
    }
    // Opens by itself only while auto is on; `/summary` opens it any time.
    if (await isAutomatic($)) void $.ui.open({ id: PANE, title: 'Summary' })
    // Waiting turns are sent in batches: this tick sends what a quiet minute and a half or a newly opened pane left over.
    timer?.cancel()
    timer = $.clock.every(10_000, () => void maybeSummarize($))

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
  isPaused = false
  await clearNote($)
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
  const language = (await read($, languageNow)) ?? settingLanguage

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
          <Button key="language" plain onPress={() => nextLanguage($)}>
            <Text size={TYPE.label} dimColor weight="semibold">{narrow ? language.slice(0, 2).toUpperCase() : language}</Text>
          </Button>
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
