import { expect, test } from 'claude-code/testing'

// Fake secrets are built from parts so this file never holds a real-looking token.
const ghFake = () => 'gh' + 'p_' + 'a'.repeat(36)

test('blocks secrets in Write and Bash and never echoes them', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const w = await $.tool.call({ tool: 'Write' as const, file_path: '/p/config.ts', content: `const t = '${ghFake()}'` })
  expect(w.deny).toContain('GitHub token')
  expect(w.deny).not.toContain(ghFake())
  expect(w.deny).toContain('password manager')

  const b = await $.tool.call({ tool: 'Bash' as const, command: `curl -H "Authorization: ${ghFake()}" https://example.test` })
  expect(b.deny).toContain('GitHub token')
  expect(b.deny).not.toContain(ghFake())
})

test('clean text and commands pass', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  expect((await $.tool.call({ tool: 'Bash' as const, command: 'git status' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Write' as const, file_path: '/p/a.ts', content: 'const x = 1' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Edit' as const, file_path: '/p/a.ts', old_string: 'x', new_string: 'y', replace_all: false })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Bash' as const, command: 'curl -H "Authorization: Bearer $TOKEN" https://example.test' })).deny).toBeUndefined()
})

test('a secret blocks on every attempt', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const content = `const t = '${ghFake()}'`
  const first = await $.tool.call({ tool: 'Write' as const, file_path: '/p/config.ts', content })
  const second = await $.tool.call({ tool: 'Write' as const, file_path: '/p/config.ts', content })
  expect(first.deny).toContain('GitHub token')
  expect(second.deny).toContain('GitHub token')

  const command = `curl -H "x: ${ghFake()}" https://example.test`
  expect((await $.tool.call({ tool: 'Bash' as const, command })).deny).toContain('GitHub token')
  expect((await $.tool.call({ tool: 'Bash' as const, command })).deny).toContain('GitHub token')
})

test('Edit, MultiEdit and NotebookEdit are checked', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const edit = await $.tool.call({ tool: 'Edit' as const, file_path: '/p/a.ts', old_string: 'x', new_string: ghFake(), replace_all: false })
  expect(edit.deny).toContain('GitHub token')

  const multi = { tool: 'MultiEdit', file_path: '/p/b.ts', edits: [{ old_string: 'a', new_string: 'ok' }, { old_string: 'b', new_string: ghFake() }] }
  expect(((await $.tool.call(multi as never)) as { deny?: string }).deny).toContain('GitHub token')

  const nb = await $.tool.call({ tool: 'NotebookEdit' as const, notebook_path: '/p/n.ipynb', new_source: `key = '${ghFake()}'` } as never)
  expect((nb as { deny?: string }).deny).toContain('GitHub token')
})

test('other key kinds are found, examples are skipped', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const stripe = 'sk' + '_live_' + 'b'.repeat(24)
  const google = 'AI' + 'za' + 'c'.repeat(35)
  const bearer = 'Authorization: ' + 'Bearer ' + 'd'.repeat(32)
  const pem = '-----BEGIN ' + 'RSA PRIVATE' + ' KEY-----'
  const password = 'pass' + 'word = "' + 'e'.repeat(12) + '"'
  const w = (content: string, file_path = '/p/k.ts') => $.tool.call({ tool: 'Write' as const, file_path, content })
  expect((await w(`const s = '${stripe}'`)).deny).toContain('Stripe key')
  expect((await w(`const g = '${google}'`)).deny).toContain('Google API key')
  expect((await w(`fetch(u, { headers: { '${bearer}' } })`)).deny).toContain('Bearer token')
  expect((await w(pem)).deny).toContain('Private key')
  expect((await w(password)).deny).toContain('Plaintext credentials')
  expect((await w(`const t = '${ghFake()}'`, '/p/a.test.ts')).deny).toContain('GitHub token')
  expect((await w(`TOKEN=${ghFake()}`, '/p/.env.example')).deny).toBeUndefined()
})

test('an error inside the guard denies the call', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const broken = await $.tool.call({ tool: 'Write', file_path: '/p/x.ts', content: 42 } as never)
  expect((broken as { deny?: string }).deny).toContain('internal error')
})

// Keyword names are built from parts so this file holds no plaintext credential for a guard to find.
const N = { pw: 'pass' + 'word', sec: 'sec' + 'ret', tok: 'tok' + 'en', key: 'api' + 'Key' }
const SECRET = 'Xq7' + 'Lm2' + 'Pz9' + 'Rt4'

test('formats the first version missed are found', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const w = (content: string) => $.tool.call({ tool: 'Write' as const, file_path: '/p/k.ts', content })
  const up = N.pw.toUpperCase()
  expect((await w(`{"${N.pw}": "${SECRET}"}`)).deny).toContain('Plaintext credentials')
  expect((await w(`DB_${up}="${SECRET}"`)).deny).toContain('Plaintext credentials')
  expect((await w(`${N.pw}: ${SECRET}`)).deny).toContain('Plaintext credentials')
  expect((await w(`client_${N.sec} = "${SECRET}"`)).deny).toContain('Plaintext credentials')
  expect((await w(`u = 'postgres://admin:${SECRET}@db/app'`)).deny).toContain('Password inside a URL')
  expect((await w(['-----BEGIN PGP', 'PRIVATE KEY BLOCK-----'].join(' '))).deny).toContain('Private key')
  expect((await w('eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12))).deny).toContain('JSON web token')
  const bash = await $.tool.call({ tool: 'Bash' as const, command: `export DB_${up}=${SECRET}` })
  expect(bash.deny).toContain('Plaintext credentials')
})

test('placeholders, references and plain words pass', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const w = (content: string) => $.tool.call({ tool: 'Write' as const, file_path: '/p/k.ts', content })
  const ref = '$' + '{process.env.KEY}'
  expect((await w(`{ ${N.pw}: "Passwort" }`)).deny).toBeUndefined()
  expect((await w('u = ' + 'postgres://user:' + 'pass' + '@host/db')).deny).toBeUndefined()
  expect((await w(`${N.tok}: "YOUR_${N.tok.toUpperCase()}_HERE"`)).deny).toBeUndefined()
  expect((await w(`${N.key}: "${ref}"`)).deny).toBeUndefined()
  expect((await w(`API_KEY="$` + `{API_KEY}"`)).deny).toBeUndefined()
  expect((await w(`${N.pw} = process.env.DB_${N.pw.toUpperCase()}`)).deny).toBeUndefined()
})

test('a malformed edit list is denied, not waved through', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const broken = await $.tool.call({ tool: 'MultiEdit', file_path: '/p/x.ts', edits: 'nope' } as never)
  expect((broken as { deny?: string }).deny).toContain('internal error')
})
