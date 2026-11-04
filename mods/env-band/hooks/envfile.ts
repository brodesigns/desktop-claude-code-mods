import type { EnvTone } from '../types'

// Pure helpers: no `$`, no state.

export const DEFAULT_VARIABLES = ['NODE_ENV', 'APP_ENV', 'ENV'] as const

// `.env`, `.env.local`, `.env.production`, ...; not `.envrc` or `.environment`.
export const isEnvFile = (name: string) => /^\.env(\.[A-Za-z0-9_.-]+)?$/.test(name)

export const isTemplate = (name: string) => /^\.env\.(example|sample|template|tpl|dist)$/i.test(name)

// Key files of dotenv tools hold keys, not an environment: listed, never read.
export const isUnread = (name: string) => /^\.env\.(keys|vault|me)$/i.test(name)

export const parseVariables = (raw: string): string[] => {
  // A name that looks secret (PASSWORD, TOKEN, KEY ...) is refused: the band would show its value.
  const names = raw.split(',').map(n => n.trim()).filter(n => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n) && !/pass|pwd|secret|token|key|credential|auth/i.test(n))
  const unique = [...new Set(names)]

  return unique.length > 0 ? unique : [...DEFAULT_VARIABLES]
}

// The order a name is taken in: `.env.local`, `.env` (both always loaded), then `.env.<mode>.local`,
// then `.env.<mode>`, then templates; alphabetical within a rank.
const rank = (name: string) =>
  name === '.env.local' ? 0 : name === '.env' ? 1 : isTemplate(name) ? 4 : name.endsWith('.local') ? 2 : 3

export const byPrecedence = (names: readonly string[]) => [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))

// A plain word only: an interpolation, a URL or anything secret-shaped never reaches the band.
const NAME = /^[A-Za-z0-9_.-]{1,24}$/

// The first of `variables` the text sets, as a plain word; '' when none. Every other line is skipped unread.
export const envName = (text: string, variables: readonly string[]): string => {
  const found = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    const key = m?.[1]
    if (key === undefined || !variables.includes(key) || found.has(key)) continue
    const raw = (m?.[2] ?? '').trim()
    const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : ''
    const value = quote !== '' ? raw.slice(1, raw.indexOf(quote, 1) > 0 ? raw.indexOf(quote, 1) : undefined) : (raw.split(/\s+#/)[0] ?? '').trim()
    if (NAME.test(value)) found.set(key, value)
  }
  for (const v of variables) {
    const value = found.get(v)
    if (value !== undefined) return value
  }

  return ''
}

export const toneOf = (name: string): EnvTone => {
  const n = name.toLowerCase()
  if (/^(prod|production|prd|live)([._-]|$)/.test(n)) return 'error'
  if (/^(staging|stage|stg|preprod|pre-prod|uat)([._-]|$)/.test(n)) return 'warning'

  return 'info'
}
