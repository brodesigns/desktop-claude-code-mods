// Pure: a git remote to the repository's web address. Only github.com is recognised, so what a click opens
// is always an https://github.com/<owner>/<repo> address built from checked parts, never the raw remote.

const NAME = '[A-Za-z0-9_.-]+'
const REMOTE = [
  new RegExp(`^git@github\\.com:(${NAME})/(${NAME}?)(?:\\.git)?/?$`),
  new RegExp(`^ssh://git@github\\.com(?::\\d+)?/(${NAME})/(${NAME}?)(?:\\.git)?/?$`),
  new RegExp(`^https://(?:[^@/]+@)?github\\.com/(${NAME})/(${NAME}?)(?:\\.git)?/?$`),
]

export const repoUrl = (remote: string): string | null => {
  for (const pattern of REMOTE) {
    const m = remote.trim().match(pattern)
    if (m !== null) return `https://github.com/${m[1]}/${m[2]}`
  }

  return null
}

const path = (branch: string) => branch.split('/').map(encodeURIComponent).join('/')

export const branchUrl = (remote: string, branch: string): string | null => {
  const repo = repoUrl(remote)

  return repo === null ? null : `${repo}/tree/${path(branch)}`
}

export const commitsUrl = (remote: string, branch: string): string | null => {
  const repo = repoUrl(remote)

  return repo === null ? null : `${repo}/commits/${path(branch)}`
}
