import type { EngineInterface } from 'claude-code'

// The cockpit's design system. Every tab builds from these steps and blocks, so spacing, borders and type
// sizes are the same everywhere. No `$`, no state: pure drawing helpers.
type Ui = ReturnType<EngineInterface['ui']['resolve']>
type Children = unknown

// Each interactive Svg is a frame of its own. At most six per pane: one for the head's worker, five for a tab.
// Beyond that a graphic is drawn as a still picture. Running states get the budget first.
export const LIVE_MAX = 5

// Spacing steps. `tight` inside a card or between chips, `base` between blocks, `loose` between groups of text.
export const SPACE = { tight: 'xs', base: 'sm', loose: 'md' } as const

// Type steps: the big tile number, a card or row title, running text, labels and side info.
export const TYPE = { figure: 'title', heading: 'heading', title: 'body', body: 'footnote', label: 'caption' } as const

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
export const BORDER: Record<Tone, string> = { ...TONE, neutral: 'subtle' }

// Raw colours, only inside Svg sources. Mid tones that read on a light and on a dark background.
export const HEX = { success: '#3FA36B', warning: '#D4A02A', error: '#DC5047', neutral: '#8A8F98', accent: '#D97757' } as const

// A role or a theme key; roles resolve, anything else passes through (`remember`, `inactive`, ...).
const text = (c: string) => (c in TONE ? TONE[c as Tone] : c)
const border = (c: string) => (c in BORDER ? BORDER[c as Tone] : c)

// A status word next to every colour: status is never colour alone.
export const MARK: Record<Tone, string> = { neutral: '○', success: '✓', warning: '●', error: '✗', accent: '◆', info: '●' }

// One big number with a label. `color` is a role or a theme key; `sub` an optional second line.
export const tile = (ui: Ui, value: string, label: string, color = 'neutral', sub = '') => {
  const { Box, Text } = ui

  return (
    <Box key={`tile-${label}`} flexDirection="column" flexGrow={1} minWidth={11} borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs">
      <Text size={TYPE.figure} weight="bold" color={text(color)} tabular wrap="truncate">{value}</Text>
      <Text dimColor size={TYPE.label} wrap="truncate">{label}</Text>
      {sub !== '' && <Text dimColor size={TYPE.label} wrap="truncate">{sub}</Text>}
    </Box>
  )
}

// The row of tiles on top of every tab.
export const tiles = (ui: Ui, key: string, children: Children) => {
  const { Box } = ui

  return (
    <Box key={key} gap={SPACE.base} flexWrap="wrap">
      {children as never}
    </Box>
  )
}

// One entry in a rounded card. `tone` is a role or a theme key; neutral draws the calm `subtle` border.
export const card = (ui: Ui, key: string, tone: string, children: Children, gap: 'xs' | 'sm' = 'xs') => {
  const { Box } = ui

  return (
    <Box key={key} flexDirection="column" borderStyle="round" overflow="hidden" borderColor={border(tone)} paddingX="sm" paddingY="xs" gap={gap}>
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
export const line = (ui: Ui, key: string, value: string, opts: { dim?: boolean; mono?: boolean; color?: string; size?: 'caption' | 'footnote'; fromEnd?: boolean } = {}) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden">
      <Text dimColor={opts.dim ?? true} mono={opts.mono} color={opts.color === undefined ? undefined : text(opts.color)} size={opts.size ?? TYPE.body} wrap={opts.fromEnd === true ? 'truncate-start' : 'truncate'}>{value}</Text>
    </Box>
  )
}

// A small coloured label in running text, with its mark: `✓ Checks`.
export const chip = (ui: Ui, key: string, label: string, color: string) => {
  const { Text } = ui

  return <Text key={key} color={text(color)} size={TYPE.label} weight="semibold">{label}</Text>
}

// A filled label: coloured background, inverse text. For the git band and the head.
export const pill = (ui: Ui, key: string, label: string, color: string, canShrink = false) => {
  const { Box, Text } = ui

  return (
    <Box key={key} paddingX="sm" backgroundColor={text(color)} flexShrink={canShrink ? 1 : 0} minWidth={canShrink ? 0 : undefined} overflow="hidden">
      <Text color="inverseText" weight="semibold" size={TYPE.body} wrap="truncate">{label}</Text>
    </Box>
  )
}

// A coloured dot plus the status word, so the state also reads without colour.
export const statusDot = (ui: Ui, key: string, tone: Tone, word = '') => {
  const { Text } = ui

  return <Text key={key} color={TONE[tone]} weight="semibold">{MARK[tone]}{word !== '' ? ` ${word}` : ''} </Text>
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

// The count on the right of a section title: `✓ none` or `● 3`, never colour alone.
export const sectionCount = (ui: Ui, n: number, tone: Tone = 'error') => {
  const { Text } = ui

  return <Text color={n > 0 ? TONE[tone] : TONE.success} size={TYPE.label} weight="semibold">{n > 0 ? `${MARK[tone]} ${n}` : '✓ none'}</Text>
}

// Nothing to show: one symbol, one short sentence, the same calm card in every tab.
export const emptyState = (ui: Ui, key: string, icon: string, sentence: string, tone: Tone = 'neutral') => {
  const { Box, Text } = ui

  return (
    <Box key={key} borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs" gap={SPACE.base} alignItems="center">
      <Box flexShrink={0}>
        <Text color={tone === 'neutral' ? 'inactive' : TONE[tone]} weight="semibold">{icon}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0} overflow="hidden">
        <Text dimColor={tone === 'neutral'} color={tone === 'neutral' ? undefined : TONE[tone]} size={TYPE.body} wrap="wrap">{sentence}</Text>
      </Box>
    </Box>
  )
}

// A measuring card: a fixed graphic (or its text stand-in) on the left, a big value and a label beside it.
export const gauge = (ui: Ui, key: string, graphic: Children, value: string, label: string, color: string, narrow = false) => {
  const { Box, Text } = ui

  return (
    <Box key={key} borderStyle="round" overflow="hidden" borderColor="subtle" paddingX="sm" paddingY="xs" flexGrow={1} minWidth={narrow ? 18 : 26} alignItems="center" gap={SPACE.base}>
      <Box flexShrink={0}>{graphic as never}</Box>
      <Box flexDirection="column" flexShrink={1} minWidth={0} overflow="hidden">
        <Text size={TYPE.figure} weight="bold" tabular color={text(color)} wrap="truncate">{value}</Text>
        <Text dimColor size={TYPE.label} wrap="truncate">{label}</Text>
      </Box>
    </Box>
  )
}

// Label and value in two columns; the label column has a fixed width, the value gives way.
export const kv = (ui: Ui, key: string, label: string, value: Children, narrow = false) => {
  const { Box, Text } = ui

  return (
    <Box key={key} gap={SPACE.base} alignItems="center">
      <Box width={narrow ? 9 : 12} flexShrink={0} overflow="hidden">
        <Text dimColor size={TYPE.label} wrap="truncate">{label}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        {value as never}
      </Box>
    </Box>
  )
}

// Filters on the left, actions on the right; wraps on a narrow pane.
export const toolbar = (ui: Ui, key: string, left: Children, right?: Children) => {
  const { Box } = ui

  return (
    <Box key={key} justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={SPACE.tight}>
      <Box gap={SPACE.tight} flexWrap="wrap">{left as never}</Box>
      {right !== undefined && right !== null && <Box gap={SPACE.tight} flexWrap="wrap">{right as never}</Box>}
    </Box>
  )
}

// "and N more": older entries that are kept but not drawn.
export const more = (ui: Ui, key: string, n: number, what = 'more (older)') => {
  const { Text } = ui

  return n > 0 ? <Text key={key} dimColor size={TYPE.label}>and {n} {what}</Text> : null
}

// Legend or stand at the very bottom of a tab.
export const legend = (ui: Ui, key: string, value: string) => {
  const { Box, Text } = ui

  return (
    <Box key={key} minWidth={0} overflow="hidden" marginTop="xs">
      <Text dimColor size={TYPE.label} wrap="wrap">{value}</Text>
    </Box>
  )
}
