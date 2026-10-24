import { expect, test } from 'claude-code/testing'

import { branchUrl, commitsUrl, repoUrl } from './git-url'

const ROOT = '/home/x/demo'

test('GitHub remotes in every spelling become one https address; other hosts and odd input give none', () => {
  for (const remote of ['git@github.com:acme/app.git', 'ssh://git@github.com/acme/app', 'https://github.com/acme/app.git', 'https://user@github.com/acme/app/']) {
    expect(repoUrl(remote)).toBe('https://github.com/acme/app')
  }
  expect(repoUrl('git@gitlab.com:acme/app.git')).toBeNull()
  expect(repoUrl('https://github.com.evil.test/acme/app')).toBeNull()
  expect(repoUrl('https://github.com/acme/app;rm -rf')).toBeNull()
  expect(repoUrl('')).toBeNull()
  expect(branchUrl('git@github.com:acme/app.git', 'feature/a b')).toBe('https://github.com/acme/app/tree/feature/a%20b')
  expect(commitsUrl('git@github.com:acme/app.git', 'main')).toBe('https://github.com/acme/app/commits/main')
  expect(branchUrl('git@gitlab.com:acme/app.git', 'main')).toBeNull()
})

test('the band: project opens the folder, branch opens GitHub, no GitHub remote copies the branch', async ($, on) => {
  const opened: string[][] = []
  let remote = 'git@github.com:acme/app.git'
  const info = () => ({ project: 'demo', branch: 'main', changed: 0, staged: 0, modified: 0, untracked: 0, ahead: 1, behind: 0, remote })
  on('state.get', (_, e) => ({ value: { value: (e as { key: string }).key === 'gitInfo' ? info() : undefined, version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))
  on('session.root', () => ({ value: ROOT }))
  on('process.run', (_, e) => {
    opened.push((e as { argv: string[] }).argv)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('ui.copy', () => ({ value: { isCopied: true as const } }))

  const ui = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 }, surface: 'desktop' } as never)
  await ui.press({ key: 'gitband-project' })
  await ui.press({ key: 'gitband-branch' })
  await ui.press({ key: 'gitband-ahead' })
  expect(opened).toEqual([
    ['open', ROOT],
    ['open', 'https://github.com/acme/app/tree/main'],
    ['open', 'https://github.com/acme/app/commits/main'],
  ])
  await ui.unmount()

  remote = ''
  opened.length = 0
  const plain = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 }, surface: 'desktop' } as never)
  await plain.press({ key: 'gitband-branch' })
  expect(opened).toEqual([])
  await plain.unmount()
})
