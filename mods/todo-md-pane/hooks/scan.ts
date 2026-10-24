import type { TodoSummary } from '../types'

// Pure helpers: no `$`, no state.

export const DEFAULT_MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX'] as const

// Comma separated words from the config; anything that is not a plain word is dropped.
export const parseMarkers = (raw: string): string[] => {
  const words = raw.split(',').map(w => w.trim()).filter(w => /^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(w))
  const unique = [...new Set(words)]

  return unique.length > 0 ? unique : [...DEFAULT_MARKERS]
}

// One count per marker, in the markers' order. Whole words only, case sensitive (`todo` in prose is not one).
export const countMarkers = (text: string, markers: readonly string[]): number[] => {
  if (text.includes('\u0000')) return markers.map(() => 0)

  return markers.map(m => text.match(new RegExp(`\\b${m}\\b`, 'g'))?.length ?? 0)
}

// `git status --porcelain=v1 -z -uall`: "XY path" per entry; a rename or copy is followed by its old path.
// Deleted files are left out, they have nothing to read.
export const changedPaths = (stdout: string): string[] => {
  const parts = stdout.split('\u0000')
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? ''
    if (entry.length < 4) continue
    const xy = entry.slice(0, 2)
    if (xy[0] === 'R' || xy[0] === 'C') i++
    if (xy.includes('D')) continue
    out.push(entry.slice(3))
  }

  return out
}

// Binary and generated files never hold a marker worth showing.
export const isSkipped = (path: string) =>
  /\.(png|jpe?g|gif|webp|ico|icns|bmp|tiff?|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|woff2?|ttf|otf|eot|mp[34]|mov|avi|wav|ogg|webm|exe|dll|so|dylib|bin|class|o|a|wasm|pyc|sqlite|db|lockb)$/i.test(path) ||
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock)$/.test(path)

export const joinPath = (dir: string, rel: string) => (rel.startsWith('/') ? rel : `${dir.replace(/\/+$/, '')}/${rel}`)

// Relative to the root when inside it, else the path itself.
export const relativeTo = (root: string, path: string) => {
  const base = root.replace(/\/+$/, '')

  return base !== '' && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
}

export type FileCounts = { path: string; counts: number[] }

// Totals per marker (zeros dropped) and the files with any marker, most markers first.
export const summarize = (found: readonly FileCounts[], markers: readonly string[], root: string): TodoSummary => {
  const withAny = found
    .map(f => ({ path: f.path, total: f.counts.reduce((a, b) => a + b, 0), counts: f.counts }))
    .filter(f => f.total > 0)
    .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))
  const counts = markers
    .map((marker, i) => ({ marker, n: withAny.reduce((sum, f) => sum + (f.counts[i] ?? 0), 0) }))
    .filter(c => c.n > 0)

  return { counts, files: withAny.slice(0, 20).map(f => relativeTo(root, f.path)), fileCount: withAny.length }
}

// "3 TODO · 1 FIXME in 2 files"
export const label = (s: TodoSummary) => {
  const parts = s.counts.map(c => `${c.n} ${c.marker}`).join(' · ')

  return `☐ ${parts} in ${s.fileCount} ${s.fileCount === 1 ? 'file' : 'files'}`
}
