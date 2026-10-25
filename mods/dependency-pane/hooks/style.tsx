import type { EngineInterface } from 'claude-code'

// Drawing helpers, a slim copy of bro-cockpit's design system. No `$`, no state.
export type Ui = ReturnType<EngineInterface['ui']['resolve']>
type Children = unknown

// Spacing steps. `tight` inside a card or between chips, `base` between blocks, `loose` between groups of text.
export const SPACE = { tight: 'xs', base: 'sm', loose: 'md' } as const

// Type steps: a pane heading, a card title, running text, labels and side info.
export const TYPE = { heading: 'heading', title: 'body', body: 'footnote', label: 'caption' } as const

// Colour roles, mapped to theme keys so light and dark mode follow the person's theme.
export type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'accent' | 'info'
export const TONE: Record<Tone, string> = {
  neutral: 'text',
  success: 'success',
  warning: 'warning',
  error: 'error',
  accent: 'claude',
  info: 'suggestion',
}

// A status mark next to every colour: status is never colour alone.
export const MARK: Record<Tone, string> = { neutral: '○', success: '✓', warning: '●', error: '✗', accent: '◆', info: '●' }

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

// A feedback line under the toolbar: what the last action did, with its mark.
export const note = (ui: Ui, key: string, text: string, tone: Tone) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden">
      <Text color={TONE[tone]} size={TYPE.label} wrap="wrap">{MARK[tone]} {text}</Text>
    </Box>
  )
}
