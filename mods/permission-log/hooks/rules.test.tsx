import { expect, mock, test } from 'claude-code/testing'

import { applyOps, asRules, copyText, isBroad, isRefusal, isSafe, isWorth, keyOf, MAX_RULES, rank, ruleFor, summaryOf } from './rules'
import type { Op } from './rules'

// Built from parts so this file does not trip a secret guard itself.
const TOKEN = 'gh' + 'p_' + 'a'.repeat(36)

const PANE = {
  plugin: 'permission-log',
  component: 'Pane',
  requestId: 'permission-log',
  props: { title: 'Permissions', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const PUSH = [{ type: 'addRules', behavior: 'allow', destination: 'localSettings', rules: [{ toolName: 'Bash', ruleContent: 'git push:*' }] }]
const op = (kind: Op['kind'], rule = 'Bash(git push:*)', at = 1, fromEngine = true): Op => ({ kind, rule, tool: 'Bash', fromEngine, example: 'git push', at })

test('only the engine suggestion is a rule; without one a label that cannot be copied is logged', () => {
  expect(ruleFor('Bash', PUSH, { command: 'git push origin main' })).toEqual({ rule: 'Bash(git push:*)', fromEngine: true })
  expect(ruleFor('Bash', undefined, { command: 'rm -rf build' })).toEqual({ rule: 'Bash · rm', fromEngine: false })
  expect(ruleFor('Edit', [{ type: 'setMode', mode: 'acceptEdits' }], { file_path: '/x' })).toEqual({ rule: 'Edit', fromEngine: false })
  // A suggestion that only denies is not used; several rules are all kept.
  expect(ruleFor('Bash', [{ type: 'addRules', behavior: 'deny', rules: [{ toolName: 'Bash', ruleContent: 'rm:*' }] }], { command: 'ls' }).fromEngine).toBe(false)
  const two = ruleFor('Bash', [{ type: 'addRules', behavior: 'allow', rules: [{ toolName: 'Bash', ruleContent: 'git add:*' }, { toolName: 'Bash', ruleContent: 'git commit:*' }] }], {})
  expect(two.rule).toBe('Bash(git add:*) + Bash(git commit:*)')
  expect(copyText(two.rule)).toBe('Bash(git add:*)\nBash(git commit:*)')
})

test('summary and rule are redacted and one line; a rule with a secret is not safe', () => {
  expect(summaryOf({ command: `curl -H "Authorization: token ${TOKEN}" x` })).not.toContain(TOKEN)
  expect(summaryOf({ command: 'a\nb\u0085c' })).toBe('a b c')
  const { rule } = ruleFor('Bash', [{ type: 'addRules', behavior: 'allow', rules: [{ toolName: 'Bash', ruleContent: `curl ${TOKEN}:*` }] }], {})
  expect(rule).not.toContain(TOKEN)
  expect(isSafe(rule)).toBe(false)
  expect(isSafe('Bash(git push:*)')).toBe(true)
})

test('broad rules are never worth allowing, even from the engine', () => {
  for (const rule of ['Bash', 'Read', 'Edit', 'Bash(rm:*)', 'Bash(curl:*)', 'Bash(python3:*)', 'Bash(sudo apt:*)', 'Bash(git push --force:*)', 'Bash(git add:*) + Bash(rm:*)']) expect(isBroad(rule)).toBe(true)
  for (const rule of ['Bash(git push:*)', 'Bash(npm test:*)', 'mcp__github__get_file', 'WebFetch(domain:example.com)']) expect(isBroad(rule)).toBe(false)
  let m = {}
  for (let i = 0; i < 3; i++) m = applyOps(m, [op('allowed', 'Bash(rm:*)'), op('allowed', 'Bash · git', 1, false)])
  expect(rank(m, 'worth')).toEqual([])
})

test('ops count a prompt as allowed or declined; worth needs 3 allowed and none declined', () => {
  let m = applyOps({}, [op('allowed'), op('allowed'), op('allowed')])
  expect(m[keyOf('Bash(git push:*)')]).toMatchObject({ asked: 3, allowed: 3, declined: 0 })
  expect(isWorth(m[keyOf('Bash(git push:*)')]!)).toBe(true)
  m = applyOps(m, [op('declined')])
  expect(m[keyOf('Bash(git push:*)')]).toMatchObject({ asked: 4, allowed: 3, declined: 1 })
  expect(isWorth(m[keyOf('Bash(git push:*)')]!)).toBe(false)
})

test('only a refusal is a no: a hook deny or the rejection wording, not any tool error', () => {
  expect(isRefusal({ deny: 'x' })).toBe(true)
  expect(isRefusal({ isError: true, text: "The user doesn't want to proceed with this tool use." })).toBe(true)
  expect(isRefusal({ isError: true, text: 'Exit code 1\nFAIL src/a.test.ts' })).toBe(false)
  expect(isRefusal({ result: 'ok' })).toBe(false)
  expect(isRefusal(null)).toBe(false)
})

test('rank: worth keeps only the often allowed, all sorts by prompts; the list is capped', () => {
  let m = applyOps({}, [op('allowed', 'a'), op('allowed', 'a'), op('allowed', 'a'), op('declined', 'b'), op('allowed', 'b')])
  expect(rank(m, 'worth').map(x => x.rule)).toEqual(['a'])
  m = applyOps(m, [op('allowed', 'b'), op('allowed', 'b')])
  expect(rank(m, 'all').map(x => x.rule)).toEqual(['b', 'a'].sort((x, y) => (m[keyOf(y)]?.asked ?? 0) - (m[keyOf(x)]?.asked ?? 0)))
  let big = {}
  for (let i = 0; i < MAX_RULES + 10; i++) big = applyOps(big, [op('allowed', `r${i}`, i)])
  expect(Object.keys(big).length).toBe(MAX_RULES)
  expect(big[keyOf('r0')]).toBeUndefined()
})

test('asRules cleans what the store holds', () => {
  const out = asRules({ x: { rule: 'a\u0085b', tool: 'Bash', fromEngine: true, asked: 2, allowed: -1, declined: 'x', first: 1, last: 2, example: 'ok' }, y: 5, z: { rule: '', tool: 'x' } })
  expect(Object.keys(out)).toEqual(['r:a b'])
  expect(out['r:a b']).toMatchObject({ asked: 2, allowed: 0, declined: 0, fromEngine: true })
  expect(asRules('x')).toEqual({})
})

const setup = (on: Parameters<typeof mock.clock>[0]) => {
  const store: Record<string, unknown> = {}
  let t = 1000
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('clock.now', () => ({ value: (t += 10) }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.PermissionDenied', () => ({}))
  on('turn.complete', () => ({ text: '' }))

  return store
}

const TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const

// The engine raises the prompt inside the tool call, as core does: the test's tool.call sits beneath the mod's.
type Raiser = { classic: { PermissionRequest: (input: never) => Promise<unknown> } }
const prompting = ($: Raiser, on: Parameters<typeof mock.clock>[0], suggestions: unknown, result: unknown, agentId?: string) =>
  on('tool.call', async (_, e) => {
    const call = e as unknown as { tool: string }
    await $.classic.PermissionRequest({ tool_name: call.tool, tool_input: e, permission_suggestions: suggestions, ...(agentId === undefined ? {} : { agent_id: agentId }) } as never)

    return result as never
  })

test('a prompt whose tool ran is allowed, even if the tool then failed; a refused one is declined', async ($, on) => {
  const store = setup(on)
  let result: unknown = { result: 'ok' }
  on('tool.call', async (_, e) => {
    await $.classic.PermissionRequest({ tool_name: (e as unknown as { tool: string }).tool, tool_input: e, permission_suggestions: PUSH } as never)

    return result as never
  })
  await $.tool.call({ tool: 'Bash', command: 'git push a' })
  // npm test style failure: the tool ran, so the prompt was allowed.
  result = { isError: true, result: 'x', text: 'Exit code 1\nFAIL' }
  await $.tool.call({ tool: 'Bash', command: 'git push b' })
  result = { isError: true, result: 'x', text: "The user doesn't want to proceed with this tool use." }
  await $.tool.call({ tool: 'Bash', command: 'git push c' })
  await $.turn.complete(TURN)
  const saved = store.permissions as Record<string, { asked: number; allowed: number; declined: number }>
  expect(saved['r:Bash(git push:*)']).toMatchObject({ asked: 3, allowed: 2, declined: 1 })
})

test('a subagent\'s turn end does not decline the main loop\'s waiting prompt; calls with no prompt count nothing', async ($, on) => {
  const store = setup(on)
  on('tool.call', async (_, e) => {
    const call = e as unknown as { tool: string; command?: string }
    if (call.command === 'git push') {
      await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: e, permission_suggestions: PUSH } as never)
      // A subagent's turn ends while this prompt is open.
      await $.turn.complete({ ...TURN, agentId: 'sub1' } as never)
    }

    return { result: 'ok' } as never
  })
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete(TURN)
  const saved = store.permissions as Record<string, { asked: number; allowed: number; declined: number }>
  expect(Object.keys(saved)).toEqual(['r:Bash(git push:*)'])
  expect(saved['r:Bash(git push:*)']).toMatchObject({ asked: 1, allowed: 1, declined: 0 })
})

test('a second ask for the same call is one prompt; the prompt of a rewritten input still matches its only waiting entry', async ($, on) => {
  const store = setup(on)
  on('tool.call', async (_, e) => {
    const call = e as unknown as { tool: string }
    await $.classic.PermissionRequest({ tool_name: call.tool, tool_input: { command: 'git push (rewritten)' }, permission_suggestions: PUSH } as never)
    await $.classic.PermissionRequest({ tool_name: call.tool, tool_input: { command: 'git push (rewritten)' }, permission_suggestions: PUSH } as never)

    return { result: 'ok' } as never
  })
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await $.turn.complete(TURN)
  expect((store.permissions as Record<string, { asked: number }>)['r:Bash(git push:*)']?.asked).toBe(1)
})

test('prompts nobody can answer (non-interactive host) are not counted', async ($, on) => {
  const store = setup(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  prompting($, on, PUSH, { result: 'ok' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await $.turn.complete(TURN)
  expect(store.permissions).toBeUndefined()
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
})

test('a prompt without an engine suggestion is logged under a label and cannot be copied', async ($, on) => {
  const store = setup(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push((e as { text: string }).text)
    return { value: { isCopied: true as const } }
  })
  prompting($, on, [], { result: 'ok' })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: `rm -rf d${i}` })
  await $.turn.complete(TURN)
  expect((store.permissions as Record<string, { allowed: number }>)['r:Bash · rm']?.allowed).toBe(3)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: '★ Worth allowing 0' })) != null).toBe(true)
  await ui.press({ key: 'view-all' })
  await ui.press({ key: 't-r:Bash · rm' })
  expect((await ui.find({ type: 'Text', text: /nothing to copy/ })) != null).toBe(true)
  expect((await ui.find({ type: 'Button', text: /copy rule/ })) == null).toBe(true)
  expect(copied).toEqual([])
  await ui.unmount()
})

test('the pane lists the rules, opens one, copies the rule and reads the all-sessions store', async ($, on) => {
  const store = setup(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push((e as { text: string }).text)
    return { value: { isCopied: true as const } }
  })
  prompting($, on, PUSH, { result: 'ok' })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'git push' })
  await $.turn.complete(TURN)
  expect(store.permissions).toBeDefined()

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const bodyColumns of [30, 36, 50, 80]) {
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface })
      expect((await ui.find({ type: 'Text', text: '★ Worth allowing 1' })) != null).toBe(true)
      await ui.press({ key: 't-r:Bash(git push:*)' })
      expect((await ui.find({ type: 'Text', text: /asked 3× · allowed 3× · declined 0×/ })) != null).toBe(true)
      await ui.press({ key: 'copy' })
      expect(copied[copied.length - 1]).toBe('Bash(git push:*)')
      expect((await ui.find({ type: 'Text', text: /Copied Bash\(git push:\*\)/ })) != null).toBe(true)
      // Close it again: the open rule is session state and survives the next mount.
      await ui.press({ key: 't-r:Bash(git push:*)' })
      await ui.press({ key: 'view-all' })
      expect((await ui.find({ type: 'Text', text: 'All asked 1' })) != null).toBe(true)
      await ui.press({ key: 'view-worth' })
      await ui.unmount()
    }
  }
})

test('notes open and close; an empty pane says so; reset needs a second press', async ($, on) => {
  const store = setup(on)
  store.permissions = { 'r:x': { rule: 'x', tool: 'Bash', fromEngine: false, asked: 1, allowed: 0, declined: 0, first: 1, last: 1, example: '' } }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Nothing yet/ })) != null).toBe(true)
    await ui.press({ key: 'info' })
    expect((await ui.find({ type: 'Text', text: /Counted from the moment this mod is installed/ })) != null).toBe(true)
    await ui.press({ key: 'info' })
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'scope' })
  await ui.press({ key: 'reset' })
  expect(Object.keys(store.permissions as object).length).toBe(1)
  await ui.press({ key: 'cancel' })
  await ui.press({ key: 'reset' })
  expect(Object.keys(store.permissions as object).length).toBe(1)
  await ui.press({ key: 'reset' })
  expect(Object.keys(store.permissions as object).length).toBe(0)
  await ui.unmount()
})
