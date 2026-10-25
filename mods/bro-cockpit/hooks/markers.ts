import type { EngineInterface } from 'claude-code'

import type { TodoSummary } from '../types'
import { changedPaths, countMarkers, isSkipped, joinPath, parseMarkers, summarize } from './markerscan'
import type { FileCounts } from './markerscan'

// Caps: at most this many files per scan, none bigger than this, at most this many session files kept.
const MAX_FILES = 200
const MAX_BYTES = 512 * 1024
const MAX_SESSION = 100

let config = { markers: parseMarkers(''), session: true }
// Files Claude wrote or edited this session (absolute). A reload starts over: the poll still has git's view.
const sessionFiles = new Set<string>()
// Counts per file, kept while mtime and size stay; only changed files are read again.
const cache = new Map<string, { stamp: string; counts: number[] }>()
let known = { cwd: '', top: '' }

// A missing git binary makes process.run throw; that counts as "no repository".
async function git($: EngineInterface, args: string[]) {
  try {
    return await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: 10_000 })
  } catch {
    return null
  }
}

async function countFile($: EngineInterface, path: string): Promise<number[] | null> {
  if (isSkipped(path)) return null
  const stat = await $.fs.stat(path).catch(() => null)
  if (stat === null || stat.kind !== 'file' || stat.size > MAX_BYTES) return null
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const hit = cache.get(path)
  if (hit !== undefined && hit.stamp === stamp) return hit.counts
  const text = await $.fs.read(path).catch(() => null)
  if (text === null) return null
  const counts = countMarkers(text, config.markers)
  cache.set(path, { stamp, counts })

  return counts
}

export function configure(markers: string, session: boolean) {
  config = { markers: parseMarkers(markers), session }
}

export const isTrackingSession = () => config.session

// Counts the markers in the changed files of the working tree and in the files Claude wrote. Null when there is none.
export async function scanMarkers($: EngineInterface): Promise<TodoSummary | null> {
  const cwd = await $.session.cwd()
  if (cwd !== known.cwd) {
    const res = await git($, ['rev-parse', '--show-toplevel'])
    known = { cwd, top: res !== null && res.exitCode === 0 ? res.stdout.trim() : '' }
  }
  const paths = new Set<string>()
  if (known.top !== '') {
    const res = await git($, ['status', '--porcelain=v1', '-z', '-uall'])
    if (res !== null && res.exitCode === 0) for (const p of changedPaths(res.stdout)) paths.add(joinPath(known.top, p))
  }
  if (config.session) for (const p of sessionFiles) paths.add(p)

  const list = [...paths].slice(0, MAX_FILES)
  const found: FileCounts[] = []
  for (const path of list) {
    const counts = await countFile($, path)
    if (counts !== null) found.push({ path, counts })
  }
  for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path)

  const fresh = summarize(found, config.markers, known.top !== '' ? known.top : cwd)

  return fresh.fileCount > 0 ? fresh : null
}

// Write, Edit and MultiEdit carry `file_path`, NotebookEdit `notebook_path`; read at run time (MultiEdit is untyped).
export async function trackFile($: EngineInterface, e: unknown) {
  const input = e as { file_path?: unknown; notebook_path?: unknown }
  const raw = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  if (raw === '') return
  const path = joinPath(await $.session.cwd(), raw)
  sessionFiles.delete(path)
  sessionFiles.add(path)
  if (sessionFiles.size > MAX_SESSION) {
    const oldest = sessionFiles.values().next().value
    if (oldest !== undefined) sessionFiles.delete(oldest)
  }
}
