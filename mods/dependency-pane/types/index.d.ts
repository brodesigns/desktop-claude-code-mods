// One declared package and its version range as written in the manifest.
export type Dep = { name: string; range: string }

// One group: a manifest's section, e.g. package.json devDependencies.
export type DepGroup = { id: string; file: string; section: string; deps: Dep[] }

export type DepInfo = {
  // The project root the files were read from.
  root: string
  groups: DepGroup[]
  hasPackageJson: boolean
  // Files found but not readable, with the reason.
  problems: string[]
}

// major: a major version (or a 0.x minor) behind latest; minor; patch; none: current.
export type Level = 'major' | 'minor' | 'patch' | 'none'

export type Outdated = { name: string; current: string; wanted: string; latest: string; level: Level }

export type DepCheck = {
  // The project root the result belongs to; a result of another root is never shown.
  root: string
  status: 'idle' | 'running' | 'done' | 'error'
  at: number
  items: Outdated[]
  message: string
}

export type DepNote = { text: string; tone: 'success' | 'warning' | 'error' }

declare module 'claude-code' {
  interface PluginState {
    'dependency-pane': {
      depInfo: DepInfo | null
      depCheck: DepCheck
      // Ids of the groups unfolded; all start folded.
      depOpen: string[]
      // The last answer of a pane action (a copy), shown under the header.
      depNote: DepNote | null
    }
  }
}
