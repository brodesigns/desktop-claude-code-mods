import { expect, test } from 'claude-code/testing'

const info = { project: 'demo', root: '~/demo', kinds: [], scripts: [], key: 'project:demo:abc' }

test('an idea is saved to the plugin store under the project key', async ($, on) => {
  const saved: { key: string; value: unknown }[] = []
  on('clock.now', () => ({ value: 5 }))
  on('store.set', (_, e) => {
    saved.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
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
