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

export async function openInProject($: EngineInterface, relative: string) {
  await openTarget($, `${await $.session.root()}/${relative}`)
}
