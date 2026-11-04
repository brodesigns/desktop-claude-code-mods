import type { Register } from 'claude-code'

// Secret patterns. Only the kind of secret is ever reported, never the value.
const PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'API key (sk-)'],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/, 'Stripe key'],
  [/\bAIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/, 'GitHub token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, 'GitLab token'],
  [/\bnpm_[A-Za-z0-9]{36}/, 'npm token'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'AWS key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JSON web token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----/, 'Private key'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i, 'Bearer token'],
]

// NAME=value and name: "value" with a password-like name. Names are matched by their ending (DB_PASSWORD, client_secret),
// the closing quote of a JSON key is allowed. A value counts only when it looks like a real secret, so placeholders,
// variable references and plain words (a translated "password" label) pass.
const ASSIGNMENT = /[A-Za-z0-9_-]*(?:password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|token)["']?\s*[:=]\s*["']?([^"'\s,}]{8,})/gi

const looksReal = (value: string): boolean => {
  if (/^[$<{(%]/.test(value) || /process\.env|import\.meta\.env|os\.environ|getenv|\$\{/.test(value)) return false
  // YOUR_TOKEN_HERE, CHANGE_ME, XXXXXXXX
  if (/^[A-Z_]+$/.test(value) || /^[xX*.\-_]+$/.test(value) || /^(?:your|change|example|placeholder|dummy|test)[-_a-z]*$/i.test(value)) return false
  // A real secret mixes letters and digits, or is at least 12 characters long.
  return (/[A-Za-z]/.test(value) && /\d/.test(value)) || value.length >= 12
}

// user:password inside a URL; the password goes through the same check, so `user:pass@host` in a doc passes.
const URL_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/:@]{4,})@/gi

const hasUrlPassword = (text: string): boolean => {
  for (const m of text.matchAll(URL_CREDENTIALS)) if (looksReal(m[1] ?? '')) return true

  return false
}

const hasAssignment = (text: string): boolean => {
  for (const m of text.matchAll(ASSIGNMENT)) if (looksReal(m[1] ?? '')) return true

  return false
}

// Tests may hold fake tokens, but they build them from parts, so only examples and dependencies are skipped.
const SKIP = /(^|\/)node_modules\/|\.env\.example$/

const HINT = 'Secrets belong in an env file or a password manager'

const problems = (text: string, path: string): string[] => {
  if (SKIP.test(path)) return []
  const kinds = new Set<string>()
  for (const [re, kind] of PATTERNS) if (re.test(text)) kinds.add(kind)
  if (hasAssignment(text)) kinds.add('Plaintext credentials')
  if (hasUrlPassword(text)) kinds.add('Password inside a URL')

  return [...kinds].map(kind => `Secret in text: ${kind}`)
}

// A find blocks on every attempt; there is no retry that lets a secret through.
function guard(path: string, text: string) {
  if (typeof text !== 'string') throw new Error('not a text')
  if (text === '') return undefined
  const found = problems(text, path)
  if (found.length === 0) return undefined

  return { deny: `secret-guard: ${path}: ${found.join('; ')}. ${HINT}. Remove the value, this find blocks on every attempt.` }
}

// The same check for shell commands: a secret typed into Bash ends up in the history and the transcript.
function guardBash(command: string) {
  if (typeof command !== 'string') throw new Error('not a command')
  const found = problems(command, '')
  if (found.length === 0) return undefined

  return { deny: `secret-guard: ${found.join('; ')}. ${HINT}. Please retry without the plaintext value.` }
}

// MultiEdit and NotebookEdit are read loosely: the fields are checked at run time, not by type.
const multiText = (e: unknown): string => {
  const edits = (e as { edits?: unknown }).edits
  if (!Array.isArray(edits)) throw new Error('edits is not a list')

  return edits
    .map(x => {
      const value = (x as { new_string?: unknown } | null)?.new_string
      if (typeof value !== 'string') throw new Error('new_string is not a text')

      return value
    })
    .join('\n')
}

const field = (e: unknown, key: string): string => {
  const v = (e as Record<string, unknown>)[key]
  if (v === undefined) return ''
  if (typeof v !== 'string') throw new Error(`${key} is not a text`)

  return v
}

// A guard that fails must not let the call through: deny with a short note unless next already ran.
const FAILED = 'secret-guard: internal error during the check, call blocked to be safe.'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => guardBash(e.command) ?? next(e)).catch(($, e, next) =>
    next.called ? next(e) : { deny: FAILED },
  )

  on('tool.call', { tool: 'Write' }, async ($, e, next) => guard(e.file_path, e.content) ?? next(e)).catch(($, e, next) =>
    next.called ? next(e) : { deny: FAILED },
  )

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => guard(e.file_path, e.new_string) ?? next(e)).catch(($, e, next) =>
    next.called ? next(e) : { deny: FAILED },
  )

  // MultiEdit is not a built-in tool in every build, so the matcher is a pattern, not a typed tool name.
  on('tool.call', { tool: /^MultiEdit$/ }, async ($, e, next) => guard(field(e, 'file_path'), multiText(e)) ?? next(e)).catch(($, e, next) =>
    next.called ? next(e) : { deny: FAILED },
  )

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => guard(field(e, 'notebook_path'), field(e, 'new_source')) ?? next(e)).catch(
    ($, e, next) => (next.called ? next(e) : { deny: FAILED }),
  )
}
