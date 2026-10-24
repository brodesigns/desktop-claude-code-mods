import type { Dep, DepGroup, Level, Outdated } from '../types'
import { redact } from './keys'

// Pure parsing of manifests and `npm outdated --json`; no `$`, no state.

const byName = (a: Dep, b: Dep) => a.name.localeCompare(b.name)

const group = (file: string, section: string, deps: Dep[]): DepGroup => ({ id: `${file}:${section}`, file, section, deps: [...deps].sort(byName) })

const entries = (value: unknown): Dep[] =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>).map(([name, range]) => ({ name, range: typeof range === 'string' ? range : JSON.stringify(range) }))
    : []

// package.json: the four dependency sections, empty ones left out. Throws on broken JSON.
export const parsePackageJson = (text: string): DepGroup[] => {
  const pkg = JSON.parse(text) as Record<string, unknown>
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .map(section => group('package.json', section, entries(pkg[section])))
    .filter(g => g.deps.length > 0)
}

// composer.json: require and require-dev, without the platform (php, ext-*, lib-*).
export const parseComposer = (text: string): DepGroup[] => {
  const pkg = JSON.parse(text) as Record<string, unknown>
  const platform = (d: Dep) => !/^(php|composer|ext-.+|lib-.+)$/i.test(d.name)
  return ['require', 'require-dev']
    .map(section => group('composer.json', section, entries(pkg[section]).filter(platform)))
    .filter(g => g.deps.length > 0)
}

// A PEP 508 requirement: name, optional [extras], then the specifier up to any `;` marker.
const pep508 = (spec: string): Dep | null => {
  const m = spec.trim().match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(.*)$/)
  if (m === null) return null
  const range = (m[3] ?? '').split(';')[0]?.trim() ?? ''

  return { name: m[1] ?? '', range: range === '' ? '*' : range }
}

// requirements.txt: one requirement per line; comments, options (-r, -e, --index-url) and URLs skipped.
export const parseRequirements = (text: string): DepGroup[] => {
  const deps: Dep[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trim()
    if (line === '' || line.startsWith('-') || /^[a-z+]+:\/\//i.test(line)) continue
    const dep = pep508(line)
    if (dep !== null) deps.push(dep)
  }

  return deps.length > 0 ? [group('requirements.txt', 'requirements', deps)] : []
}

// The strings of a TOML array that may span lines: `dependencies = ["a>=1", 'b[x]']`. Brackets inside quotes do not end it.
const tomlArray = (body: string, key: string): string[] | null => {
  const m = body.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[`, 'm'))
  if (m === null || m.index === undefined) return null
  const out: string[] = []
  let quote = ''
  let word = ''
  for (const ch of body.slice(m.index + m[0].length)) {
    if (quote !== '') {
      if (ch === quote) {
        out.push(word)
        quote = ''
        word = ''
      } else word += ch
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === ']') break
  }

  return out
}

// The tables of a TOML file by header, each with its body up to the next header.
const tables = (text: string): Map<string, string> => {
  const out = new Map<string, string>()
  let name = ''
  let body: string[] = []
  for (const line of text.split('\n')) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*(#.*)?$/)
    if (head !== null) {
      out.set(name, body.join('\n'))
      name = (head[1] ?? '').trim()
      body = []
    } else body.push(line)
  }
  out.set(name, body.join('\n'))

  return out
}

// `name = "^1.0"` or `name = { version = "^1.0", ... }` lines of a poetry table; python itself left out.
const poetry = (body: string): Dep[] => {
  const deps: Dep[] = []
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(.+?)\s*$/)
    if (m === null || (m[1] ?? '').toLowerCase() === 'python') continue
    const value = m[2] ?? ''
    const range = value.match(/^["']([^"']*)["']/)?.[1] ?? value.match(/version\s*=\s*["']([^"']*)["']/)?.[1] ?? (value.startsWith('{') ? '(source)' : value)
    deps.push({ name: m[1] ?? '', range })
  }

  return deps
}

// pyproject.toml: PEP 621 `[project] dependencies` and optional groups, and poetry's tables. A minimal reader.
export const parsePyproject = (text: string): DepGroup[] => {
  const t = tables(text)
  const groups: DepGroup[] = []
  const project = tomlArray(t.get('project') ?? '', 'dependencies')
  if (project !== null) groups.push(group('pyproject.toml', 'project', project.map(pep508).filter((d): d is Dep => d !== null)))
  const optional = t.get('project.optional-dependencies') ?? ''
  for (const m of optional.matchAll(/^\s*([A-Za-z0-9_-]+)\s*=\s*\[/gm)) {
    const list = tomlArray(optional, m[1] ?? '') ?? []
    groups.push(group('pyproject.toml', `optional ${m[1] ?? ''}`, list.map(pep508).filter((d): d is Dep => d !== null)))
  }
  for (const [name, body] of t) {
    const m = name.match(/^tool\.poetry\.(dependencies|dev-dependencies|group\.([^.]+)\.dependencies)$/)
    if (m === null) continue
    groups.push(group('pyproject.toml', m[2] !== undefined ? `poetry ${m[2]}` : `poetry ${m[1] ?? ''}`, poetry(body)))
  }

  return groups.filter(g => g.deps.length > 0)
}

const version = (v: string) => {
  const m = v.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] as const
}

// How far `have` is behind `latest`. Under 1.0 a minor step breaks like a major one.
export const level = (have: string, latest: string): Level => {
  const a = version(have)
  const b = version(latest)
  if (a === null || b === null) return have === latest ? 'none' : 'minor'
  if (a[0] < b[0]) return 'major'
  if (a[0] === 0 && b[0] === 0 && a[1] < b[1]) return 'major'
  if (a[0] === b[0] && a[1] < b[1]) return 'minor'
  if (a[0] === b[0] && a[1] === b[1] && a[2] < b[2]) return 'patch'

  return 'none'
}

export type Parsed = { items: Outdated[] } | { error: string }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

// `npm outdated --json`: `{ name: { current, wanted, latest, ... } }`, with workspaces a list per name.
// An empty answer means all current; `{ error: { summary } }` and anything not JSON are errors.
export const parseOutdated = (stdout: string): Parsed => {
  const text = stdout.trim()
  if (text === '') return { items: [] }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { error: `npm returned no JSON: ${redact(text.split('\n')[0] ?? '').slice(0, 160)}` }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { error: 'npm returned an unexpected answer.' }
  const err = (data as { error?: { summary?: unknown; code?: unknown } }).error
  if (err !== undefined && typeof err === 'object' && err !== null) {
    return { error: redact(str(err.summary) || str(err.code) || 'npm reported an error.').slice(0, 300) }
  }
  const items: Outdated[] = []
  for (const [name, raw] of Object.entries(data as Record<string, unknown>)) {
    const first = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined
    if (first === undefined || first === null || typeof first !== 'object') continue
    const current = str(first.current)
    const wanted = str(first.wanted)
    const latest = str(first.latest)
    items.push({ name, current, wanted, latest, level: level(current || wanted, latest) })
  }
  const rank: Record<Level, number> = { major: 0, minor: 1, patch: 2, none: 3 }

  return { items: items.sort((a, b) => rank[a.level] - rank[b.level] || a.name.localeCompare(b.name)) }
}
