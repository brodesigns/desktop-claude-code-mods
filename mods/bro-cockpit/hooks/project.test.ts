import { expect, test } from 'claude-code/testing'

const info = { project: 'demo', root: '~/demo', kinds: [], scripts: [], key: 'project:demo:abc' }

test('an idea is saved to the plugin store under the project key', async ($, on) => {
  const saved: { key: string; value: unknown }[] = []
  on('clock.now', () => ({ value: 5 }))
  on('store.set', (_, e) => {
    saved.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  on('store.get', () => ({ value: [] }))
  on('state.get', (_, e) => ({ value: { value: (e as unknown as { key: string }).key === 'projectInfo' ? info : [], version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))

  const res = await $.command.run({ command: 'idea', args: 'Dark theme', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
  expect(res.text).toContain('saved')
  expect(saved[0]?.key).toBe('project:demo:abc')
})

test('without a known project nothing is saved and the reply says so', async ($, on) => {
  const saved: string[] = []
  on('clock.now', () => ({ value: 5 }))
  on('store.set', (_, e) => {
    saved.push(e.key)
    return { value: undefined }
  })
  on('state.get', (_, e) => ({ value: { value: (e as unknown as { key: string }).key === 'projectInfo' ? null : [], version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))

  const res = await $.command.run({ command: 'idea', args: 'Dark theme', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
  expect(res.text).toContain('Not saved')
  expect(saved.length).toBe(0)
})

test('an idea saved while another session saved too keeps both (the store is read again before the write)', async ($, on) => {
  const stored: unknown[] = [{ id: 1, kind: 'idea', text: 'from this session', status: 'open', at: 1 }]
  const state = new Map<string, unknown>([['projectInfo', info], ['ideaList', [...stored]]])
  on('clock.now', () => ({ value: 5 }))
  on('store.get', () => ({ value: stored.slice() }))
  on('store.set', (_, e) => {
    stored.length = 0
    stored.push(...(e.value as unknown[]))
    return { value: undefined }
  })
  on('state.get', (_, e) => ({ value: { value: state.get((e as unknown as { key: string }).key), version: 1 } }))
  on('state.set', (_, e) => {
    state.set((e as unknown as { key: string }).key, (e as unknown as { value: unknown }).value)
    return { value: { isSet: true as const, version: 2 } }
  })

  // Another session adds an idea behind this one's back: this session's state still shows one idea.
  stored.push({ id: 2, kind: 'idea', text: 'from the other session', status: 'open', at: 2 })
  const res = await $.command.run({ command: 'idea', args: 'Dark theme', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
  expect(res.text).toContain('saved')
  expect((stored as { id: number; text: string }[]).map(i => [i.id, i.text])).toEqual([[1, 'from this session'], [2, 'from the other session'], [3, 'Dark theme']])
  expect((state.get('ideaList') as unknown[]).length).toBe(3)
})

test('a store that refuses the value is reported, not called saved', async ($, on) => {
  on('clock.now', () => ({ value: 5 }))
  on('store.get', () => ({ value: [] }))
  on('store.set', () => {
    throw new Error('full')
  })
  on('state.get', (_, e) => ({ value: { value: (e as unknown as { key: string }).key === 'projectInfo' ? info : [], version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))

  const res = await $.command.run({ command: 'idea', args: 'Dark theme', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
  expect(res.text).toContain('Not saved')
})
