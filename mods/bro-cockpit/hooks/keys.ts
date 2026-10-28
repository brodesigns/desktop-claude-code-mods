// Secret patterns. Anything the cockpit keeps or shows goes through `redact` first.
const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\bAIza[0-9A-Za-z_-]{35}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\bnpm_[A-Za-z0-9]{36}/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  // The whole key block, from the BEGIN line to the END line (or the end of the text).
  /-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY[A-Z ]*-----|$)/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  // user:password inside a URL (database, git remote, registry).
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/:@]{3,}@/i,
  /\s-u\s+[^\s:]+:[^\s]{3,}/,
  // NAME=value and name: "value", also DB_PASSWORD, "password": "x", export API_KEY=x.
  /[A-Za-z0-9_-]*(?:password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|token)["']?\s*[:=]\s*["']?[^"'\s,}]{8,}/i,
]

const GLOBAL = PATTERNS.map(re => new RegExp(re.source, `${re.flags.replace('g', '')}g`))

// Replaces every secret in a text, for anything the mod keeps or shows.
export const redact = (text: string): string => GLOBAL.reduce((out, re) => out.replace(re, '[secret removed]'), text)

// The engine refuses a whole pane when a text holds a control character (ESC, BEL, NUL, DEL, C1). Terminal colour
// codes in stderr are the usual source: strip the sequences, then drop what is left. Tab and newline stay.
const ESCAPES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g
export const printable = (text: string): string => text.replace(ESCAPES, '').replace(CONTROLS, '')
