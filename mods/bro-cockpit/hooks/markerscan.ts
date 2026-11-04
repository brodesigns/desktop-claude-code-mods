import type { TodoHit, TodoSummary } from '../types'
import { redact } from './keys'
import { plain } from './todomd'

// Pure helpers: no `$`, no state.

export const DEFAULT_MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX'] as const

// Comma separated words from the config; anything that is not a plain word is dropped.
export const parseMarkers = (raw: string): string[] => {
  const words = raw.split(',').map(w => w.trim()).filter(w => /^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(w))
  const unique = [...new Set(words)]

  return unique.length > 0 ? unique : [...DEFAULT_MARKERS]
}

// Whole word, case sensitive (`todo` in prose is not one). The first marker that occurs in the line names the hit.
const markerIn = (line: string, markers: readonly string[]): string | null => {
  let best: { marker: string; at: number } | null = null
  for (const marker of markers) {
    const at = line.search(new RegExp(`\\b${marker}\\b`))
    if (at >= 0 && (best === null || at < best.at)) best = { marker, at }
  }

  return best === null ? null : best.marker
}

// A repository line can be a minified megabyte: only the start of it is ever shown, so only the start is processed.
const cap = (text: string) => text.slice(0, 600)

export const clipLine = (text: string, max = 120) => {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// Hits in one file's text, with their line numbers. A file with a NUL byte is binary: none.
export const hitsIn = (file: string, text: string, markers: readonly string[]): TodoHit[] => {
  if (text.includes('\u0000')) return []
  const out: TodoHit[] = []
  text.split('\n').forEach((line, i) => {
    const marker = markerIn(line, markers)
    if (marker !== null) out.push({ file, line: i + 1, marker, text: clipLine(redact(plain(cap(line)))) })
  })

  return out
}

// `git grep -n --full-name` output: `path:line:text` per hit. Lines that do not fit are left out.
export const parseGrep = (stdout: string, markers: readonly string[], max = 5000): TodoHit[] => {
  const out: TodoHit[] = []
  for (const row of stdout.split('\n')) {
    if (out.length >= max) break
    const m = row.match(/^(.+?):(\d+):(.*)$/)
    if (m === null) continue
    const marker = markerIn(m[3] ?? '', markers)
    if (marker !== null) out.push({ file: m[1] ?? '', line: Number(m[2]), marker, text: clipLine(redact(plain(cap(m[3] ?? '')))) })
  }

  return out
}

// Binary and generated files never hold a marker worth showing, nor do prose documents (a README or changelog
// that names the marker words is not a task); the todo.md is the checklist, not a source of hits.
export const isSkipped = (path: string) =>
  /\.(png|jpe?g|gif|webp|ico|icns|bmp|tiff?|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|woff2?|ttf|otf|eot|mp[34]|mov|avi|wav|ogg|webm|exe|dll|so|dylib|bin|class|o|a|wasm|pyc|sqlite|db|lockb|map|min\.js|min\.css|md|mdx|markdown|txt|rst|adoc)$/i.test(path) ||
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock)$/.test(path) ||
  /^todo\.md$/i.test(path)

export const joinPath = (dir: string, rel: string) => (rel.startsWith('/') ? rel : `${dir.replace(/\/+$/, '')}/${rel}`)

// Relative to the root when inside it, else the path itself.
export const relativeTo = (root: string, path: string) => {
  const base = root.replace(/\/+$/, '')

  return base !== '' && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
}

export const HITS_KEPT = 60

// Totals per marker (zeros dropped), the number of files and the first hits in file and line order.
export const summarize = (all: readonly TodoHit[], markers: readonly string[], root: string): TodoSummary => {
  const hits = all.filter(h => !isSkipped(h.file)).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  const counts = markers.map(marker => ({ marker, n: hits.filter(h => h.marker === marker).length })).filter(c => c.n > 0)
  const files = [...new Set(hits.map(h => h.file))]

  return { counts, files: files.slice(0, 20), fileCount: files.length, hits: hits.slice(0, HITS_KEPT), root }
}

// "3 TODO · 1 FIXME in 2 files"
export const label = (s: TodoSummary) => {
  const parts = s.counts.map(c => `${c.n} ${c.marker}`).join(' · ')

  return `☐ ${parts} in ${s.fileCount} ${s.fileCount === 1 ? 'file' : 'files'}`
}
