import type { Prompt, PromptScope } from '../types'
import { shortHash } from './hash'

export const NAME_MAX = 40

export type Parsed = { scope: PromptScope; name: string; text: string } | { error: 'syntax' | 'name' | 'text' }

// `/prompt-save [--project] <name>: <text>`; the text may run over several lines.
export const parseSave = (args: string): Parsed => {
  let rest = args.trim()
  let scope: PromptScope = 'global'
  const flag = /^--project(?:\s+|$)/i.exec(rest)
  if (flag !== null) {
    scope = 'project'
    rest = rest.slice(flag[0].length)
  }
  const colon = rest.indexOf(':')
  if (colon < 0) return { error: 'syntax' }
  const name = rest.slice(0, colon).trim()
  const text = rest.slice(colon + 1).replace(/^[ \t]*\n?/, '').trimEnd()
  if (name === '') return { error: 'syntax' }
  if (name.length > NAME_MAX || /[|\n]/.test(name)) return { error: 'name' }
  if (text.trim() === '') return { error: 'text' }

  return { scope, name, text }
}

// One id per scope and name: saving the same name again replaces that prompt.
export const idOf = (scope: PromptScope, name: string) => `${scope === 'global' ? 'g' : 'p'}-${shortHash(name.toLowerCase())}`

// Whatever the store holds, only well-formed prompts come back.
export const asList = (value: unknown): Prompt[] =>
  Array.isArray(value)
    ? value.filter(
        (p): p is Prompt =>
          typeof p === 'object' && p !== null && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.text === 'string' && typeof p.at === 'number',
      )
    : []

// Adds a prompt, or replaces the one of the same name in place.
export const upsert = (list: Prompt[], prompt: Prompt): { list: Prompt[]; isNew: boolean } => {
  const isNew = !list.some(p => p.id === prompt.id)

  return { list: isNew ? [...list, prompt] : list.map(p => (p.id === prompt.id ? { ...prompt, at: p.at } : p)), isNew }
}

const HOLE = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/g

// The placeholder names in order of first appearance, each once.
export const placeholders = (text: string): string[] => [...new Set([...text.matchAll(HOLE)].map(m => m[1] ?? ''))].filter(n => n !== '')

// Fills each placeholder that has a value; an empty value leaves `{{name}}` standing.
export const fillIn = (text: string, values: Record<string, string>) =>
  text.replace(HOLE, (whole, name: string) => {
    const value = values[name.trim()] ?? ''

    return value.trim() === '' ? whole : value
  })


export const firstLine = (text: string) => text.split('\n').find(l => l.trim() !== '')?.trim() ?? ''

// `/p <name> [value1 | value2]`: the longest saved name the arguments start with, project prompts first.
export const findByName = (prompts: Prompt[], args: string): { prompt: Prompt; rest: string } | undefined => {
  const typed = args.trim()
  const lower = typed.toLowerCase()
  let best: Prompt | undefined
  for (const p of prompts) {
    const name = p.name.toLowerCase()
    const boundary = lower.charAt(name.length)
    if (lower.startsWith(name) && (boundary === '' || /[\s|]/.test(boundary)) && (best === undefined || p.name.length > best.name.length)) best = p
  }
  if (best === undefined) return undefined

  return { prompt: best, rest: typed.slice(best.name.length).trim().replace(/^\|\s*/, '') }
}

// The text `/p` puts in the box: values go into the placeholders in order; without placeholders they follow the text.
export const compose = (prompt: Prompt, rest: string): { text: string; open: string[] } => {
  const holes = placeholders(prompt.text)
  if (holes.length === 0) return { text: rest === '' ? prompt.text : `${prompt.text}\n\n${rest}`, open: [] }
  const given = rest === '' ? [] : rest.split('|').map(v => v.trim())
  const values: Record<string, string> = {}
  holes.forEach((hole, i) => (values[hole] = given[i] ?? ''))
  const text = fillIn(prompt.text, values)

  return { text, open: placeholders(text) }
}
