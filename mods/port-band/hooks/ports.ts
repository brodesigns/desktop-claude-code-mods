import type { Listener } from '../types'

// Pure parsing of `lsof` and `ss` output; no `$`, no state.

// The ports shown by default: the usual dev servers.
export const DEFAULT_PORTS = [3000, 3001, 4200, 5000, 5173, 8000, 8080, 8888]

// Runtimes that say nothing about the server: for a known port the usual tool's name stands in.
const GENERIC = new Set(['node', 'bun', 'deno', 'python', 'python3', 'ruby', 'php', 'java'])
const KNOWN: Record<number, string> = { 4173: 'vite', 4200: 'angular', 5173: 'vite', 6006: 'storybook', 8888: 'jupyter' }

// The ports setting: a comma or space separated list, or `all` / `*` for every own port from 1024 up.
export type Wanted = { all: true } | { all: false; ports: number[] }

export const wanted = (value: unknown): Wanted => {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'all' || text === '*') return { all: true }
  const ports = text
    .split(/[\s,;]+/)
    .map(p => Number(p))
    .filter(p => Number.isInteger(p) && p > 0 && p < 65536)

  return { all: false, ports: ports.length > 0 ? ports : DEFAULT_PORTS }
}

// lsof escapes odd bytes in the command name (`\x20` for a space).
const unescape = (name: string) => name.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

// `lsof -nP -iTCP -sTCP:LISTEN`: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME, NAME being `*:3000 (LISTEN)`.
export const parseLsof = (stdout: string): Listener[] => {
  const out: Listener[] = []
  for (const line of stdout.split('\n')) {
    const m = line.match(/^(\S+)\s+(\d+)\s.*\s(\S+):(\d+)\s+\(LISTEN\)\s*$/)
    if (m === null) continue
    out.push({ port: Number(m[4]), name: unescape(m[1] ?? ''), pid: Number(m[2]) })
  }

  return out
}

// `ss -ltnp`: State Recv-Q Send-Q Local:Port Peer:Port Process. Process is `users:(("node",pid=1,fd=20))`,
// present only for the person's own processes (unless root).
export const parseSs = (stdout: string): Listener[] => {
  const out: Listener[] = []
  for (const line of stdout.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols[0] !== 'LISTEN') continue
    const port = Number((cols[3] ?? '').match(/:(\d+)$/)?.[1] ?? NaN)
    if (!Number.isInteger(port)) continue
    const proc = line.match(/users:\(\("([^"]*)",pid=(\d+)/)
    out.push({ port, name: proc?.[1] ?? '', pid: Number(proc?.[2] ?? 0) })
  }

  return out
}

// What the band shows: one entry per port (IPv4 and IPv6 fold), sorted, filtered by the setting.
// `all` keeps ports from 1024 up whose process is known, i.e. the person's own.
export const select = (list: Listener[], want: Wanted): Listener[] => {
  const byPort = new Map<number, Listener>()
  for (const l of list) {
    const pass = want.all ? l.port >= 1024 && l.name !== '' : want.ports.includes(l.port)
    if (!pass) continue
    const had = byPort.get(l.port)
    if (had === undefined || (had.name === '' && l.name !== '')) byPort.set(l.port, l)
  }

  return [...byPort.values()].sort((a, b) => a.port - b.port)
}

// The name beside a port: the process, or for a bare runtime on a known port the usual tool.
export const label = (l: Listener) => {
  const name = l.name.toLowerCase()
  if ((name === '' || GENERIC.has(name)) && KNOWN[l.port] !== undefined) return KNOWN[l.port] ?? ''

  return l.name
}
