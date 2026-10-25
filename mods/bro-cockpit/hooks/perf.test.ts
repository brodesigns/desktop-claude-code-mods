import { expect, test } from 'claude-code/testing'

import { setIfChanged } from './state'

// A state that remembers writes, so a test can count them per key.
type OnLike = (event: string, hook: (_: unknown, e: unknown) => unknown) => void

const memory = (on: OnLike) => {
  const mem = new Map<string, unknown>()
  const writes: string[] = []
  on('state.get', (_, e) => ({ value: { value: mem.get((e as unknown as { key: string }).key), version: 1 } }))
  on('state.set', (_, e) => {
    const w = e as unknown as { key: string; value: unknown }
    mem.set(w.key, w.value)
    writes.push(w.key)
    return { value: { isSet: true as const, version: 2 } }
  })

  return { mem, writes }
}

test('setIfChanged writes nothing for an equal value', async () => {
  let value: unknown = { a: 1, list: [1, 2] }
  let writes = 0
  const get = async () => value
  const set = async (v: unknown) => {
    writes += 1
    value = v
  }

  expect(await setIfChanged(get, set, { a: 1, list: [1, 2] })).toBe(false)
  expect(writes).toBe(0)
  expect(await setIfChanged(get, set, { a: 2, list: [1, 2] })).toBe(true)
  expect(writes).toBe(1)
  expect(await setIfChanged(get, set, { a: 2, list: [1, 2] })).toBe(false)
  expect(writes).toBe(1)
})

test('an unchanged measurement writes neither the meter nor the head counts', async ($, on) => {
  const { writes } = memory(on as never)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const input = { context: { window: 200_000, tokens: 50_000, percent: 25.2 }, rateLimits: [], changed: ['context' as const] }

  await $.session.measure(input)
  const first = writes.length
  expect(writes).toContain('meter')
  expect(writes).toContain('headCounts')

  await $.session.measure({ ...input, context: { ...input.context, percent: 24.9 } })
  expect(writes.length).toBe(first)
})

test('the head counts follow the tool calls in one atom', async ($, on) => {
  const { mem } = memory(on as never)
  on('tool.call', () => ({ result: {} }))
  on('clock.now', () => ({ value: 1 }))

  await $.tool.call({ tool: 'Bash' as const, command: 'ls' })
  await $.tool.call({ tool: 'Bash' as const, command: 'pwd' })
  const counts = mem.get('headCounts') as { calls: number; errors: number } | undefined

  expect(counts?.calls).toBe(2)
  expect(counts?.errors).toBe(0)
})

// Fake secrets are built from parts so this file never holds a real-looking token.
const ghFake = () => 'gh' + 'p_' + 'a'.repeat(36)

test('tool calls keep no secret in the state', async ($, on) => {
  const { mem } = memory(on as never)
  on('tool.call', () => ({ result: {} }))
  on('clock.now', () => ({ value: 1 }))

  await $.tool.call({ tool: 'Bash' as const, command: `echo ${ghFake()}` })
  const kept = JSON.stringify(mem.get('callList') ?? [])
  expect(kept).not.toContain(ghFake())
  expect(kept).toContain('[secret removed]')
})

test('a long session keeps counting: the calls tile passes 150 and failed calls stay in the list', async ($, on) => {
  const { mem } = memory(on as never)
  let n = 0
  on('tool.call', () => (++n === 1 ? ({ result: {}, isError: true } as never) : { result: {} }))
  on('clock.now', () => ({ value: 1 }))
  on('session.cwd', () => ({ value: '/p' }))
  on('session.root', () => ({ value: '/p' }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  for (let i = 0; i < 170; i++) await $.tool.call({ tool: 'Bash' as const, command: `echo ${i}` })
  const counts = mem.get('headCounts') as { calls: number; callsFailed: number; errors: number }
  const list = mem.get('callList') as { isError: boolean }[]

  expect(counts.calls).toBe(170)
  expect(list.length).toBe(150)
  // The first call failed and is the oldest, yet it is still there: finished calls without a failure go first.
  expect(list[0]?.isError).toBe(true)
  expect(counts.callsFailed).toBe(1)
  expect(counts.errors).toBe(1)
})

test('a call whose tool rejects does not stay running', async ($, on) => {
  const { mem } = memory(on as never)
  on('tool.call', () => {
    throw new Error('boom')
  })
  on('clock.now', () => ({ value: 1 }))
  on('session.cwd', () => ({ value: '/p' }))
  on('session.root', () => ({ value: '/p' }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  await $.tool.call({ tool: 'Bash' as const, command: 'ls' }).catch(() => undefined)
  const list = mem.get('callList') as { isDone: boolean; isError: boolean }[]
  expect(list.length).toBe(1)
  expect(list[0]?.isDone).toBe(true)
  expect(list[0]?.isError).toBe(true)
})

test('a stopped subagent is not an error, and a new tool call of a finished one makes it run again', async ($, on) => {
  const { mem } = memory(on as never)
  on('clock.now', () => ({ value: 1 }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: (e as { answer?: string }).answer ?? '' }))
  on('session.cwd', () => ({ value: '/p' }))
  on('session.root', () => ({ value: '/p' }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  mem.set('agentList', [{ id: 'a1', type: 'general-purpose', description: 'work', isBackground: true, isDone: false, isFailed: false, tools: 0, last: '', startedAt: 1, endedAt: 0, parent: '' }])
  const done = (reason: string) =>
    $.turn.complete({ agentId: 'a1', reason, isAborted: reason === 'aborted', answer: '', durationMs: 1, turnId: 't' } as never)
  await done('aborted')
  let row = (mem.get('agentList') as { isDone: boolean; isFailed: boolean; isAborted?: boolean }[])[0]
  expect([row?.isDone, row?.isFailed, row?.isAborted]).toEqual([true, false, true])

  await $.tool.call({ tool: 'Bash' as const, command: 'ls', agentId: 'a1' } as never)
  row = (mem.get('agentList') as typeof row[])[0]
  expect([row?.isDone, row?.isFailed, row?.isAborted]).toEqual([false, false, false])

  await done('error')
  row = (mem.get('agentList') as typeof row[])[0]
  expect([row?.isDone, row?.isFailed]).toEqual([true, true])
})
