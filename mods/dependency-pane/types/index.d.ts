// One declared package and its version range as written in the manifest.
export type Dep = { name: string; range: string }

// One group: a manifest's section, e.g. package.json devDependencies.
export type DepGroup = { id: string; file: string; section: string; deps: Dep[] }

export type DepInfo = {
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
  status: 'idle' | 'running' | 'done' | 'error'
  at: number
  items: Outdated[]
  message: string
}

declare module 'claude-code' {
  interface PluginState {
    'dependency-pane': {
      depInfo: DepInfo | null
      depCheck: DepCheck
      // Ids of the groups folded shut.
      depClosed: string[]
    }
  }
}
