export type GitInfo = {
  project: string
  // The `origin` remote as git spells it; '' without one. Only used to build links.
  remote?: string
  branch: string
  changed: number
  staged: number
  modified: number
  untracked: number
  ahead: number
  behind: number
}
export type AgentRow = {
  id: string
  type: string
  description: string
  isBackground: boolean
  isDone: boolean
  isFailed: boolean
  tools: number
  last: string
  startedAt: number
  endedAt: number
  parent: string
}
export type Call = {
  id: string
  tool: string
  arg: string
  detail: string
  lines: number
  note: string
  isDone: boolean
  isError: boolean
  isDenied?: boolean
  startedAt: number
  ms: number
  agent: boolean
  agentId: string
}
export type FileRow = { path: string; reads: number; writes: number; edits: number; lines: number; agent: boolean; at: number }
export type Limit = { kind: string; percent: number; resetsAt: string }
export type Meter = { percent: number; tokens: number; window: number; usd: number; limits: Limit[] }
export type TurnStat = { at: number; ms: number; input: number; output: number; cacheRead: number; cacheWrite: number; isAgent: boolean }
export type Idea = { id: number; kind: string; text: string; status: string; at: number }
export type ProjectInfo = {
  project: string
  root: string
  kinds: string[]
  scripts: { name: string; cmd: string }[]
  key?: string
}
// Every number the pane's head and the start page show, kept in one value so they read one atom.
export type HeadCounts = {
  calls: number
  callsFailed: number
  files: number
  filesChanged: number
  filesRead: number
  agentsRunning: number
  agentsTotal: number
  context: number
  limit: number
  errors: number
  ideas: number
  ideasOpen: number
}

declare module 'claude-code' {
  interface PluginState {
    'bro-cockpit': {
      gitInfo: GitInfo | null
      agentList: AgentRow[]
      agentNow: number
      callList: Call[]
      fileList: FileRow[]
      cockpitTab: string
      ideaList: Idea[]
      ideaKind: string
      projectInfo: ProjectInfo | null
      fileFilter: string
      agentView: string
      meter: Meter | null
      turnStats: TurnStat[]
      toolFilter: string
      toolOpen: string[]
      headCounts: HeadCounts
    }
  }
}
