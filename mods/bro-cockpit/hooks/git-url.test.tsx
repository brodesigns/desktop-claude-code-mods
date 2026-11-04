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
  const copies: string[] = []
  let branch = 'main'
  const info = () => ({ project: 'demo', branch, changed: 0, staged: 0, modified: 0, untracked: 0, ahead: 1, behind: 1, remote })
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
  on('ui.copy', (_, e) => {
    copies.push((e as { text: string }).text)
    return { value: { isCopied: true as const } }
  })
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 }, surface: 'desktop' } as never)
  await ui.press({ key: 'gitband-project' })
  await ui.press({ key: 'gitband-branch' })
  // Unpushed commits have no page on the remote: the push command is copied. Commits to pull open the commits page.
  await ui.press({ key: 'gitband-ahead' })
  expect(copies).toEqual(['git push'])
  await ui.press({ key: 'gitband-behind' })
  expect(opened).toEqual([
    ['open', '-R', ROOT],
    ['open', 'https://github.com/acme/app/tree/main'],
    ['open', 'https://github.com/acme/app/commits/main'],
  ])
  await ui.unmount()

  // A checked-out commit has no branch page: it is labelled, and the click copies a hint instead of a dead link.
  branch = 'detached'
  copies.length = 0
  opened.length = 0
  const loose = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 }, surface: 'desktop' } as never)
  expect((await loose.find({ type: 'Text', text: /⎇ detached/ })) != null).toBe(true)
  await loose.press({ key: 'gitband-branch' })
  expect(opened).toEqual([])
  expect(copies).toEqual(['git rev-parse --short HEAD'])
  await loose.unmount()
  branch = 'main'

  remote = ''
  opened.length = 0
  const plain = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 100 }, surface: 'desktop' } as never)
  await plain.press({ key: 'gitband-branch' })
  expect(opened).toEqual([])
  await plain.unmount()
})

test('a long project and branch name give way, the state and the push mark stay in the row', async ($, on) => {
  const info = { project: 'p'.repeat(80), branch: 'feature/' + 'b'.repeat(80), changed: 3, staged: 0, modified: 3, untracked: 0, ahead: 2, behind: 0, remote: '' }
  on('state.get', (_, e) => ({ value: { value: (e as { key: string }).key === 'gitInfo' ? info : undefined, version: 1 } }))
  on('state.set', () => ({ value: { isSet: true as const, version: 2 } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const bodyColumns of [30, 100]) {
    const ui = await $.ui.mount({ plugin: 'bro-cockpit', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns }, surface: 'desktop' } as never)
    expect((await ui.find({ type: 'Button', text: /changes?|●/ })) != null).toBe(true)
    expect((await ui.find({ type: 'Button', text: /↑/ })) != null).toBe(true)
    await ui.unmount()
  }
})
