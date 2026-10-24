// Secret patterns. Anything the cockpit keeps or shows goes through `redact` first.
const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bsk_live_[A-Za-z0-9]{16,}/,
  /\bAIza[0-9A-Za-z_-]{35}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
]

const GLOBAL = PATTERNS.map(re => new RegExp(re.source, `${re.flags.replace('g', '')}g`))

// Replaces every secret in a text, for anything the mod keeps or shows.
export const redact = (text: string): string => GLOBAL.reduce((out, re) => out.replace(re, '[secret removed]'), text)
