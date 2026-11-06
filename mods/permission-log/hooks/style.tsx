import type { EngineInterface } from 'claude-code'

// Drawing helpers, a slim copy of snippet-pane's. No `$`, no state.
export type Ui = ReturnType<EngineInterface['ui']['resolve']>
type Children = unknown

// Brand blue for accent glyphs and small primary buttons.
export const ACCENT = '#39639E'

// Spacing steps. `tight` inside a block, `base` between blocks.
export const SPACE = { tight: 'xs', base: 'sm' } as const

// Type steps: a pane heading, running text and labels.
export const TYPE = { title: 'body', body: 'footnote', label: 'caption' } as const

export type Tone = 'success' | 'warning' | 'error'
const TONE: Record<Tone, { color: string; mark: string }> = {
  success: { color: 'success', mark: '✓' },
  warning: { color: 'warning', mark: '●' },
  error: { color: 'error', mark: '✗' },
}

// Nothing to show: one symbol, one short sentence, in a calm card.
export const emptyState = (ui: Ui, key: string, icon: string, sentence: string) => {
  const { Box, Text } = ui

  return (
    <Box key={key} borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs" gap={SPACE.base} alignItems="center">
      <Box flexShrink={0}>
        <Text color="inactive" weight="semibold">{icon}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0} overflow="hidden">
        <Text dimColor size={TYPE.body} wrap="wrap">{sentence}</Text>
      </Box>
    </Box>
  )
}

// A feedback line: what the last action did, with its mark.
export const note = (ui: Ui, key: string, text: string, tone: Tone) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden">
      <Text color={TONE[tone].color} size={TYPE.label} wrap="wrap">{TONE[tone].mark} {text}</Text>
    </Box>
  )
}

// Buttons in a row that wraps on a narrow pane.
export const actions = (ui: Ui, key: string, children: Children) => {
  const { Box } = ui

  return (
    <Box key={key} gap={SPACE.tight} flexWrap="wrap">
      {children as never}
    </Box>
  )
}
