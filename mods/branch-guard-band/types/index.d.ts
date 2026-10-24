// The current branch, null when detached or outside git.
export type BranchName = string | null

declare module 'claude-code' {
  interface PluginState {
    'branch-guard-band': { branch: BranchName }
  }
}
