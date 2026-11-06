import { expect, test } from 'claude-code/testing'

import { applyOps, asRules, isSafe, isWorth, keyOf, MAX_RULES, rank, ruleOf, summaryOf } from './rules'
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
const op = (kind: Op['kind'], rule = 'Bash(git push:*)', at = 1): Op => ({ kind, rule, tool: 'Bash', example: 'git push', at })

test('the rule is the engine suggestion, else the tool or the first Bash word', () => {
  expect(ruleOf('Bash', PUSH, { command: 'git push origin main' })).toBe('Bash(git push:*)')
  expect(ruleOf('Bash', undefined, { command: 'npm test' })).toBe('Bash(npm:*)')
  expect(ruleOf('mcp__github__get_file', [], {})).toBe('mcp__github__get_file')
  expect(ruleOf('WebFetch', [{ type: 'addRules', behavior: 'allow', rules: [{ toolName: 'WebFetch' }] }], {})).toBe('WebFetch')
  // A suggestion that only denies is not used.
  expect(ruleOf('Bash', [{ type: 'addRules', behavior: 'deny', rules: [{ toolName: 'Bash', ruleContent: 'rm:*' }] }], { command: 'ls' })).toBe('Bash(ls:*)')
})

test('summary and rule are redacted and one line; a rule with a secret is not safe', () => {
  expect(summaryOf({ command: `curl -H "Authorization: token ${TOKEN}" x` })).not.toContain(TOKEN)
  expect(summaryOf({ command: 'a\nb\u0085c' })).toBe('a b c')
  const rule = ruleOf('Bash', [{ type: 'addRules', behavior: 'allow', rules: [{ toolName: 'Bash', ruleContent: `curl ${TOKEN}:*` }] }], {})
  expect(rule).not.toContain(TOKEN)
  expect(isSafe(rule)).toBe(false)
  expect(isSafe('Bash(git push:*)')).toBe(true)
})

test('ops count asked, allowed and declined per rule; worth needs 3 allowed and none declined', () => {
  let m = applyOps({}, [op('asked'), op('allowed'), op('asked'), op('allowed'), op('asked'), op('allowed')])
  expect(m[keyOf('Bash(git push:*)')]).toMatchObject({ asked: 3, allowed: 3, declined: 0 })
  expect(isWorth(m[keyOf('Bash(git push:*)')]!)).toBe(true)
  m = applyOps(m, [op('asked'), op('declined')])
  expect(isWorth(m[keyOf('Bash(git push:*)')]!)).toBe(false)
  m = applyOps(m, [op('refused', 'Bash(rm:*)')])
  expect(m[keyOf('Bash(rm:*)')]).toMatchObject({ asked: 1, declined: 1 })
})

test('rank: worth keeps only the often allowed, all sorts by prompts; the list is capped', () => {
  let m = applyOps({}, [op('asked', 'a'), op('asked', 'b'), op('asked', 'b')])
  for (let i = 0; i < 3; i++) m = applyOps(m, [op('allowed', 'a')])
  expect(rank(m, 'worth').map(x => x.rule)).toEqual(['a'])
  expect(rank(m, 'all').map(x => x.rule)).toEqual(['b', 'a'])
  let big = {}
  for (let i = 0; i < MAX_RULES + 10; i++) big = applyOps(big, [op('asked', `r${i}`, i)])
  expect(Object.keys(big).length).toBe(MAX_RULES)
  expect(big[keyOf('r0')]).toBeUndefined()
})

test('asRules cleans what the store holds', () => {
  const out = asRules({ x: { rule: 'a\u0085b', tool: 'Bash', asked: 2, allowed: -1, declined: 'x', first: 1, last: 2, example: 'ok' }, y: 5, z: { rule: '', tool: 'x' } })
  expect(Object.keys(out)).toEqual(['r:a b'])
  expect(out['r:a b']).toMatchObject({ asked: 2, allowed: 0, declined: 0 })
  expect(asRules('x')).toEqual({})
})

const setup = ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]) => {
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

test('a prompt followed by the tool is allowed; one without it is declined at the turn end', async ($, on) => {
  const store = setup($, on)
  on('tool.call', () => ({ result: 'ok' }))
  for (let i = 0; i < 3; i++) {
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: `git push o${i}` }, permission_suggestions: PUSH } as never)
    await $.tool.call({ tool: 'Bash', command: `git push o${i}` })
  }
  // Asked, but the tool never ran.
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf x' }, permission_suggestions: [] } as never)
  expect(store.permissions).toBeUndefined()
  await $.turn.complete(TURN)
  const saved = store.permissions as Record<string, { asked: number; allowed: number; declined: number }>
  expect(saved['r:Bash(git push:*)']).toMatchObject({ asked: 3, allowed: 3, declined: 0 })
  expect(saved['r:Bash(rm:*)']).toMatchObject({ asked: 1, allowed: 0, declined: 1 })
})

test('a tool that came back refused counts as declined', async ($, on) => {
  const store = setup($, on)
  on('tool.call', () => ({ deny: 'no' }))
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'make deploy' }, permission_suggestions: [] } as never)
  await $.tool.call({ tool: 'Bash', command: 'make deploy' })
  await $.turn.complete(TURN)
  expect((store.permissions as Record<string, { declined: number }>)['r:Bash(make:*)']?.declined).toBe(1)
})

test('the pane lists the rules, opens one, copies the rule and reads the all-sessions store', async ($, on) => {
  const store = setup($, on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push((e as { text: string }).text)
    return { value: { isCopied: true as const } }
  })
  on('tool.call', () => ({ result: 'ok' }))
  for (let i = 0; i < 3; i++) {
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' }, permission_suggestions: PUSH } as never)
    await $.tool.call({ tool: 'Bash', command: 'git push' })
  }
  await $.turn.complete(TURN)
  expect(store.permissions).toBeDefined()

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const bodyColumns of [36, 70]) {
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
  const store = setup($, on)
  store.permissions = { 'r:x': { rule: 'x', tool: 'Bash', asked: 1, allowed: 0, declined: 0, first: 1, last: 1, example: '' } }
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
