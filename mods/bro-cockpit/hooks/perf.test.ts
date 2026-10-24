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
