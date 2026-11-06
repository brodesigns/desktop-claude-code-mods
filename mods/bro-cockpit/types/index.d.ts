// One entry of the project's todo.md; `index` is its line in the file.
export type TodoItem = { index: number; raw: string; text: string; depth: number; section: string; done: boolean }
export type TodoList = { path: string; name: string; items: TodoItem[] }
export type TodoNote = { text: string; tone: 'success' | 'warning' | 'error' }
// The last removal, so a tick can be taken back: the line number and the removed lines.
export type TodoUndo = { path: string; index: number; lines: string[]; text: string }
// One marker (TODO, FIXME ...) and how often it occurs in the scanned files.
export type TodoCount = { marker: string; n: number }
// One marker in a file: where it stands and the line it stands in (shortened).
export type TodoHit = { file: string; line: number; marker: string; text: string }
// Code markers in the whole project: counts per marker (only above 0), how many files hold any, the first hits
// in file and line order, and the folder the files are relative to.
export type TodoSummary = { counts: TodoCount[]; files: string[]; fileCount: number; hits: TodoHit[]; root: string }

export type UsageKind = 'skill' | 'plugin' | 'connector'
// One thing that was used: how often, when first and when last (epoch ms).
export type UsageEntry = { kind: UsageKind; name: string; n: number; first: number; last: number }
// Entries by `kind:name`.
export type UsageItems = Record<string, UsageEntry>
// Something installed: a skill (or command), a connector (MCP server) or a plugin, with a rough token estimate.
export type InstalledItem = { kind: UsageKind; name: string; tokens: number; plugin?: string }
// What one built-in tool did: calls, failed calls, calls refused by a hook, total time (ms).
export type ToolStat = { name: string; n: number; failed: number; denied: number; ms: number }
export type ToolStats = Record<string, ToolStat>

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
  // Ended by an interruption: shown as stopped, not as an error.
  isAborted?: boolean
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
  todoOpen: number
  todoCode: number
}

declare module 'claude-code' {
  interface PluginState {
    'bro-cockpit': {
      gitInfo: GitInfo | null
      agentList: AgentRow[]
      agentNow: number
      callList: Call[]
      // Every tool call of the session (the list keeps only the newest).
      callTotal: number
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
      todoList: TodoList | null
      todoNote: TodoNote | null
      todoUndo: TodoUndo | null
      todoMarkers: TodoSummary | null
      todoAdding: boolean
      // Usage tab: this session's counts, all sessions (copy of the plugin store), what is installed, built-in tool stats.
      usageSession: Shaped<UsageItems>
      usageAll: Shaped<UsageItems>
      usageInstalled: Shaped<InstalledItem[]>
      usageToolsSession: Shaped<ToolStats>
      usageToolsAll: Shaped<ToolStats>
      // 'used', 'unused', 'context' or 'tools'
      usageView: string
      // 'skill', 'plugin' or 'connector'
      usageKind: string
      // 'session' or 'all'
      usageScope: string
      // 'most' or 'least'
      usageSort: string
      usageInfo: boolean
      usageConfirm: boolean
    }
  }
}
