import type { Snippet } from '../types'

export const TITLE_MAX = 80

export type Parsed = { title: string; code: string; lang: string } | { error: 'title' | 'code' }

const FENCE = /^```[ \t]*([\w+#.-]{0,20})[^\n]*\n([\s\S]*?)\n?[ \t]*```[ \t]*$/
const INLINE_FENCE = /^```([\w+#.-]{1,20})?[ \t]+([\s\S]*?)[ \t]*```$/

// Code inside a ``` fence gives its language; without one the language is guessed.
export const unfence = (body: string): { code: string; lang: string } => {
  const text = body.replace(/^\s*\n/, '').trimEnd()
  const block = FENCE.exec(text.trimStart())
  if (block !== null) return { code: (block[2] ?? '').trimEnd(), lang: (block[1] ?? '').toLowerCase() }
  const inline = INLINE_FENCE.exec(text.trim())
  if (inline !== null) return { code: inline[2] ?? '', lang: (inline[1] ?? '').toLowerCase() }

  return { code: text, lang: '' }
}

// `/snippet <title>` with the code on the next lines, or `/snippet <title> | <code>` on one line.
export const parseSnippet = (args: string): Parsed => {
  const text = args.replace(/^\s+/, '')
  const nl = text.indexOf('\n')
  const bar = text.indexOf('|')
  let title: string
  let body: string
  if (nl >= 0 && (bar < 0 || nl < bar)) {
    title = text.slice(0, nl)
    body = text.slice(nl + 1)
  } else if (bar >= 0) {
    title = text.slice(0, bar)
    body = text.slice(bar + 1).replace(/^[ \t]+/, '')
  } else {
    return text.trim() === '' ? { error: 'title' } : { error: 'code' }
  }
  title = title.trim().slice(0, TITLE_MAX)
  if (title === '' || title.startsWith('```')) return { error: 'title' }
  const { code, lang } = unfence(body)
  if (code.trim() === '') return { error: 'code' }

  return { title, code, lang: lang === '' ? guessLang(code) : lang }
}

// A cheap guess from the first lines; `text` when nothing fits.
export const guessLang = (code: string): string => {
  const head = code.split('\n').slice(0, 30).join('\n')
  const first = head.split('\n').find(l => l.trim() !== '')?.trim() ?? ''
  const shebang = /^#!.*\b(bash|sh|zsh|python3?|node|deno|php)\b/.exec(first)
  if (shebang !== null) return { bash: 'sh', sh: 'sh', zsh: 'sh', python: 'py', python3: 'py', node: 'js', deno: 'ts', php: 'php' }[shebang[1] ?? ''] ?? 'sh'
  if (/^<\?php/.test(first)) return 'php'
  if (/^\s*[{[]/.test(head)) {
    try {
      JSON.parse(code)
      return 'json'
    } catch {
      // not JSON, go on
    }
  }
  if (/^\s*(<!doctype html|<html|<(div|section|span|head|body|template|ul|a|p|button)\b)/i.test(head)) return 'html'
  if (/^\s*(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|CREATE (TABLE|INDEX|VIEW)|ALTER TABLE|WITH\s+\w+\s+AS)\b/im.test(head)) return 'sql'
  if (/^\s*(def |class \w+(\(.*\))?:|from [\w.]+ import |import \w+\s*$|if __name__ ==)/m.test(head) || (/\bprint\(/.test(head) && !/;\s*$/m.test(head))) return 'py'
  if (/^\s*(interface |type \w+\s*=|enum |export (type|interface) )|:\s*(string|number|boolean|void|unknown)\b|<\w+>\(/m.test(head)) return /<[A-Z]\w*[\s/>]/.test(head) ? 'tsx' : 'ts'
  if (/^\s*(import .* from |export |const |let |var |function |async function )|=>|require\(/m.test(head)) return /<[A-Z]\w*[\s/>]/.test(head) ? 'jsx' : 'js'
  if (/^\s*(\$\s+)?(npm|npx|pnpm|yarn|git|cd|ls|curl|wget|docker|brew|sudo|echo|export|mkdir|rm|cp|mv|chmod|ssh|claude)\s/m.test(head)) return 'sh'
  if (/^\s*[.#@]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[\s\S]*?[\w-]+\s*:\s*[^;{}]+;/m.test(head)) return 'css'
  if (/^\s*(package|func) \w+/m.test(head)) return 'go'
  if (/^\s*(fn |use \w+::|let mut |impl )/m.test(head)) return 'rust'
  if (/^[\w-]+:(\s|$)/m.test(head) && head.split('\n').filter(l => /^\s*[\w-]+:(\s|$)|^\s*- /.test(l)).length >= 2) return 'yaml'
  if (/^#{1,6} \S/m.test(head)) return 'md'

  return 'text'
}

// Whatever the store holds, only well-formed snippets come back.
export const asList = (value: unknown): Snippet[] =>
  Array.isArray(value)
    ? value.filter(
        (s): s is Snippet =>
          typeof s === 'object' && s !== null && typeof s.id === 'number' && typeof s.title === 'string' && typeof s.code === 'string' && typeof s.lang === 'string',
      )
    : []

export const lineCount = (code: string) => code.split('\n').length

// The first lines for the preview.
export const preview = (code: string, lines: number) => code.split('\n').slice(0, Math.max(1, lines)).join('\n')
