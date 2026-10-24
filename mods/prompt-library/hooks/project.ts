import { shortHash } from './hash'

// Folder name plus a short hash of the full root path: two repos with the same name keep their own data,
// a worktree (other root) gets its own.
export const projectOf = (root: string, prefix: string) => {
  const project = root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''

  return { project: project === '' ? root : project, key: `${prefix}:project:${project}:${shortHash(root)}` }
}
