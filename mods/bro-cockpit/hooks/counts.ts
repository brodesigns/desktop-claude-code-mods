import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { HeadCounts } from '../types'
import { setIfChanged } from './state'
import { isFailed } from './status'

export const EMPTY_COUNTS: HeadCounts = {
  calls: 0, callsFailed: 0, files: 0, filesChanged: 0, filesRead: 0, agentsRunning: 0, agentsTotal: 0,
  context: -1, limit: -1, errors: 0, ideas: 0, ideasOpen: 0,
}

// Every reader declares this atom in its own file (validate wants the literal reference there).
const headCounts = atom({ plugin: 'bro-cockpit', key: 'headCounts' } as const, EMPTY_COUNTS)

const calls = atom({ plugin: 'bro-cockpit', key: 'callList' } as const, [])
const files = atom({ plugin: 'bro-cockpit', key: 'fileList' } as const, [])
const agents = atom({ plugin: 'bro-cockpit', key: 'agentList' } as const, [])
const meter = atom({ plugin: 'bro-cockpit', key: 'meter' } as const, null)
const ideas = atom({ plugin: 'bro-cockpit', key: 'ideaList' } as const, [])

// Recounts from the lists and writes `headCounts` only when a number moved. The head and the start page
// read this one atom, so a write to a list (every tool call) redraws them only when a shown number changes.
export async function refreshCounts($: EngineInterface) {
  const c = await read($, calls)
  const f = await read($, files)
  const a = await read($, agents)
  const m = await read($, meter)
  const i = await read($, ideas)
  const failed = c.filter(isFailed).length
  const counts: HeadCounts = {
    calls: c.length,
    callsFailed: failed,
    files: f.length,
    filesChanged: f.filter(x => x.writes + x.edits > 0).length,
    filesRead: f.filter(x => (x.reads ?? 0) > 0).length,
    agentsRunning: a.filter(x => !x.isDone).length,
    agentsTotal: a.length,
    context: m?.percent ?? -1,
    limit: m?.limits?.find(l => l.kind === 'five_hour')?.percent ?? -1,
    errors: failed,
    ideas: i.length,
    ideasOpen: i.filter(x => x.status !== 'done').length,
  }

  return setIfChanged(() => read($, headCounts), v => update($, headCounts, () => v), counts)
}
