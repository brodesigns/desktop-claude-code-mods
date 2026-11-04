// Secret patterns. Anything the mod keeps or shows goes through `redact` first.
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
  /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/,
  /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/,
  /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/,
  /\bAuthorization:\s*Basic\s+[A-Za-z0-9+/=]{12,}/i,
  /\bhf_[A-Za-z0-9]{30,}/,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
  /\bAccountKey=[A-Za-z0-9+/=]{30,}/,
  // The name prefix is bounded: an unbounded `[A-Za-z0-9_-]*` is quadratic on a long run of such characters.
  /[A-Za-z0-9_-]{0,64}(?:password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|token)["']?\s*[:=]\s*["']?[^"'\s,}]{8,}/i,
]

const GLOBAL = PATTERNS.map(re => new RegExp(re.source, `${re.flags.replace('g', '')}g`))

export const MASK = '[secret removed]'

// Replaces every secret in a text, for anything the mod keeps or shows.
export const redact = (text: string): string => GLOBAL.reduce((out, re) => out.replace(re, MASK), text)

const masks = (text: string) => text.split(MASK).length - 1

// The redacted text and how many places were masked, so the caller can warn.
export const redactCounted = (text: string): { text: string; masked: number } => {
  const out = redact(text)

  return { text: out, masked: masks(out) - masks(text) }
}
