// Pure helpers: no `$`, no state.

// Comma separated branch names from the config; `*` matches any run of characters, `/` included.
export const parsePatterns = (raw: string): RegExp[] => {
  const names = raw.split(',').map(n => n.trim()).filter(n => n !== '')
  const list = names.length > 0 ? names : ['main', 'master']

  return [...new Set(list)].map(n => new RegExp(`^${n.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`))
}

export const isProtected = (branch: string, patterns: readonly RegExp[]) => patterns.some(p => p.test(branch))
