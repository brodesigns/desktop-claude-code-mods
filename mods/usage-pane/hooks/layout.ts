import type { RenderInput } from 'claude-code'

// The pane's width in cells. Falls back to the viewport, then to a middle value.
export const columns = (e: RenderInput): number => {
  const props = (e as unknown as { props?: { bodyColumns?: number } }).props
  const viewport = (e as unknown as { viewport?: { columns?: number } }).viewport

  return props?.bodyColumns ?? viewport?.columns ?? 60
}

export const isNarrow = (e: RenderInput) => columns(e) < 44
