import type { EngineInterface } from 'claude-code'

import type { TodoHit, TodoSummary } from '../types'
import { hitsIn, isSkipped, joinPath, parseGrep, parseMarkers, relativeTo, summarize } from './markerscan'

// Caps: session files only matter without git; none bigger than this is read, at most this many are kept.
const MAX_BYTES = 512 * 1024
const MAX_SESSION = 100

let config = { markers: parseMarkers(''), session: true }
// Files Claude wrote or edited this session (absolute). Used only in a project without git.
const sessionFiles = new Set<string>()
let known = { cwd: '', top: '' }

// A missing git binary makes process.run throw; that counts as "no repository".
async function git($: EngineInterface, args: string[], timeoutMs = 10_000) {
  try {
    return await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs })
  } catch {
    return null
  }
}

export function configure(markers: string, session: boolean) {
  config = { markers: parseMarkers(markers), session }
}

export const isTrackingSession = () => config.session

// In a repository: one `git grep` over every tracked file and every untracked one that is not ignored, so a TODO
// in the middle of any file counts. Without git: the files Claude wrote. Null when there is no hit.
export async function scanMarkers($: EngineInterface): Promise<TodoSummary | null> {
  const cwd = await $.session.cwd()
  if (cwd !== known.cwd) {
    const res = await git($, ['rev-parse', '--show-toplevel'])
    known = { cwd, top: res !== null && res.exitCode === 0 ? res.stdout.trim() : '' }
  }

  let hits: TodoHit[] = []
  if (known.top !== '') {
    // Exit 1 means "no match"; any other failure reads as "nothing found this time".
    const res = await git($, ['grep', '-I', '-n', '-w', '--untracked', '--full-name', '--no-color', ...config.markers.flatMap(m => ['-e', m])], 15_000)
    if (res !== null && (res.exitCode === 0 || res.exitCode === 1)) hits = parseGrep(res.stdout, config.markers)
  } else if (config.session) {
    for (const path of sessionFiles) {
      if (isSkipped(path)) continue
      const stat = await $.fs.stat(path).catch(() => null)
      if (stat === null || stat.kind !== 'file' || stat.size > MAX_BYTES) continue
      const text = await $.fs.read(path).catch(() => null)
      if (typeof text === 'string') hits.push(...hitsIn(relativeTo(cwd, path), text, config.markers))
    }
  }

  const root = known.top !== '' ? known.top : cwd
  const fresh = summarize(hits, config.markers, root)

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
