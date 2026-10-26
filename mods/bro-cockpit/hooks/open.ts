import type { EngineInterface } from 'claude-code'

// Opens a file or folder with the system's opener. Argument vector, no shell: the target is never parsed.
export async function openTarget($: EngineInterface, target: string) {
  for (const program of ['open', 'xdg-open']) {
    try {
      const res = await $.process.run([program, target], { timeoutMs: 5_000 })
      if (res.exitCode === 0) return
    } catch {
      // This opener is not there; the next one tries.
    }
  }
  $.ui.toast(`Could not open ${target}`)
}

// Shows a file in the file manager and never opens it: a file from a project you did not write (a cloned repo)
// must not be run by a click (`open x.command`, `.app`, `.terminal` would start). macOS selects it in Finder,
// elsewhere the containing folder opens.
export async function revealTarget($: EngineInterface, path: string) {
  const folder = path.slice(0, Math.max(0, path.lastIndexOf('/'))) || '/'
  for (const argv of [['open', '-R', path], ['xdg-open', folder]]) {
    try {
      const res = await $.process.run(argv, { timeoutMs: 5_000 })
      if (res.exitCode === 0) return
    } catch {
      // This opener is not there; the next one tries.
    }
  }
  $.ui.toast(`Could not show ${path}`)
}
