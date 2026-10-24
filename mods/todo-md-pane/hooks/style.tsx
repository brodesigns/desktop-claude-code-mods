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
// Borders: a calm card is `subtle`, only a real problem gets its colour.
const BORDER: Record<Tone, string> = { ...TONE, neutral: 'subtle' }

// A status mark next to every colour: status is never colour alone.
export const MARK: Record<Tone, string> = { neutral: '○', success: '✓', warning: '●', error: '✗', accent: '◆', info: '●' }

// One entry in a rounded card. Neutral draws the calm `subtle` border.
export const card = (ui: Ui, key: string, tone: Tone, children: Children) => {
  const { Box } = ui

  return (
    <Box key={key} flexDirection="column" borderStyle="round" overflow="hidden" borderColor={BORDER[tone]} paddingX="sm" paddingY="xs" gap={SPACE.tight}>
      {children as never}
    </Box>
  )
}

// The first row of a card: a title that gives way on the left, fixed side info on the right.
export const cardHead = (ui: Ui, key: string, title: Children, side?: Children) => {
  const { Box, Text } = ui

  return (
    <Box key={key} justifyContent="space-between" alignItems="center" gap={SPACE.base}>
      <Box flexShrink={1} minWidth={0} overflow="hidden">
        <Text size={TYPE.title} weight="semibold" wrap="truncate">{title as never}</Text>
      </Box>
      {side !== undefined && side !== null && side !== false && <Box flexShrink={0}>{side as never}</Box>}
    </Box>
  )
}

// One line of text that never runs past the border.
export const line = (ui: Ui, key: string, value: string, opts: { dim?: boolean; mono?: boolean } = {}) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden">
      <Text dimColor={opts.dim ?? true} mono={opts.mono} size={TYPE.body} wrap="truncate">{value}</Text>
    </Box>
  )
}

// A small coloured label with its mark: `◆ global`.
export const chip = (ui: Ui, key: string, label: string, tone: Tone) => {
  const { Text } = ui

  return <Text key={key} color={TONE[tone]} size={TYPE.label} weight="semibold">{label}</Text>
}

// A section heading with an optional count or note on the right.
export const sectionTitle = (ui: Ui, key: string, title: string, side?: Children) => {
  const { Box, Text } = ui

  return (
    <Box key={key} justifyContent="space-between" alignItems="center" gap={SPACE.base} marginTop="xs">
      <Box flexShrink={1} minWidth={0} overflow="hidden">
        <Text size={TYPE.body} weight="semibold" wrap="truncate">{title}</Text>
      </Box>
      {side !== undefined && side !== null && side !== false && <Box flexShrink={0}>{side as never}</Box>}
    </Box>
  )
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

// A feedback line under the toolbar: what the last action did, with its mark.
export const note = (ui: Ui, key: string, text: string, tone: Tone) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden">
      <Text color={TONE[tone]} size={TYPE.label} wrap="wrap">{MARK[tone]} {text}</Text>
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

// Legend at the very bottom.
export const legend = (ui: Ui, key: string, value: string) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden" marginTop="xs">
      <Text dimColor size={TYPE.label} wrap="wrap">{value}</Text>
    </Box>
  )
}
