# 05 Design and UI

## Design system (`hooks/style.tsx`)

Every tab builds from the same steps and building blocks. No locally built tiles, cards or chips.

**Spacing** (`SPACE`): `tight` = `xs` (inside cards, between chips and buttons), `base` = `sm` (between blocks, the default `gap`), `loose` = `md` (between groups of text in a row).

**Type** (`TYPE`): `figure` = `title` (big tile number, bold, `tabular`), `heading` (only the title "Cockpit"), `title` = `body` (card title, semibold), `body` = `footnote` (running text), `label` = `caption` (labels, side info, dimmed).

**Color roles** (`Tone`, `TONE`): `neutral` (text, border `subtle`), `success`, `warning`, `error`, `accent` (claude), `info` (suggestion). Building blocks take a role or a theme key (`remember`, `inactive`, `permission`). Every role has a mark (`MARK`: ✓ ● ✗ ○ ◆), status is never color alone. Fixed hex values only inside Svg, from `HEX` (mid tones that read on light and dark).

**Building blocks:**

| Block | Used for |
|---|---|
| `tile`, `tiles` | big number with a label, row at the top of a tab. The number is colored only for a warning or a problem |
| `card`, `cardHead` | entry in a rounded border; head row with a title (gives way) and fixed side info on the right. Border `subtle`, colored only for a problem |
| `line` | one line of text that never runs past the border (`fromEnd` for paths) |
| `chip`, `pill` | colored label with a mark; filled pill with `inverseText` (band, head) |
| `statusDot` | mark plus status word before a title |
| `sectionTitle`, `sectionCount` | section title, on the right `✓ none` or `● 3` |
| `emptyState` | empty state: a symbol and one short sentence in a calm card |
| `kv` | label and value in two columns (project, scripts, limits) |
| `gauge` | measuring card: graphic on the left, big number and label on the right (Instruments) |
| `toolbar` | filters on the left, actions on the right, wraps when narrow |
| `more`, `legend` | "and N more", legend or status at the very bottom |

## The same layout in every tab

1. **Tiles on top** (`tiles`): three numbers.
2. **Filters and actions** (`toolbar`): buttons, the active filter `primary`, actions (`Clear`, `↓ Newest`) on the right, all `secondary`.
3. **Empty state** (`emptyState`) or **entries in cards** (`card` with `cardHead`): title semibold, side info `caption` and dimmed.
4. **Legend or status** (`legend`) at the very bottom, only when there are entries.

Tab order: Overview (start), Files, Subagents, Tool calls (what happens in the session), Instruments, Errors (health), Project (info, scripts, ideas and change requests).

Files tab: shows read files (`▤ read ×N`, tool Read) and changed files (`✎ changed ×N`, `◧ new`), filters All, Changed, Read only.

## Band above the prompt (hooks/git.tsx)

One border with two rows, a yellow border when there are uncommitted changes:

1. `▣ Project` (gives way) and filled pills: `⎇ Branch` · `✓ All committed` or `● N changes` · `↑ N to push` · `↓ N to pull`. Narrow: short words (`✓ clean`, `● N open`, `↑ N`).
2. Only with changes and when not narrow: `✓ N ready to commit` (staged), `✎ N modified`, `＋ N new` (untracked).

Project name: the folder of the main repository (`git rev-parse --git-common-dir`), so a worktree also shows the real project name. Without a git repository, the folder name. The same info appears as one line in the head of the cockpit pane.

## Overview and tab choice

- **The start page is the overview** (`hooks/home.tsx`): on top the card "Needs attention" (red border, counter, `open ›` per entry) with everything that is in a red state (failed tool calls, context or limit from 85 percent), otherwise the empty state "All calm". Below it the section "Areas": one tile per tab with symbol, title, `open ›` on the right, a big number and a sub line. Red border and `⚠` only for a real problem. One column when narrow, otherwise two, three when wide.
- **Tab choice** through a select field (`Select`, label "View") with a symbol and a counter per entry; a counter of 0 is left out. In the terminal, which has no `Select`, a row of buttons with the same labels.
- **Head:** when wide, the title (with worker) on the left and the project line on the right, stacked when narrow. The project line gives way, pills wrap.
- Every tab provides a `summary($)` for the overview. New tab: an entry in `TABS`, a `summary` and a tile in `home.tsx`.

## Layout of the cockpit pane

```
Cockpit            ⎇ main · clean         (head: title, worker if busy, git line)
View: [ Overview v ]   (select field, buttons in the terminal)
...tab content...
```

- Outside `Box flexDirection="column" gap={SPACE.base}`, padding `sm`, `xs` when narrow.
- The current tab lives in the atom `cockpitTab`. `/cockpit <tab>` jumps straight there.
- Every tab exports `view($, e)`; `register.tsx` calls the one for the current tab.

## Patterns

- **Row in fixed columns:** fixed parts with `width` and `flexShrink={0}`, the text between them `flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden"` with `wrap="truncate"`. Tool calls: status 3, tool 14 (narrow 11), argument, time 7. Files: mark 2, type 5 (not narrow), name, status 22 (narrow 5), bar 6 (wide only), lines 6.
- **Card:** `card(ui, key, tone, children)`. Problem cards with role `error` or `warning`, otherwise `neutral`.
- **Details on click:** `Button plain label="▸ ⌘ Bash"` toggles the id in an atom (`toolOpen`), with an indented border below.
- **Filter chips:** a row of buttons, the active one `variant="primary"`, the rest `secondary`.
- **Grouping:** consecutive identical tools are folded into `Read ×12`, the key from the oldest element.
- **Type:** `size` caption/footnote for side info, `mono` for commands and paths, `tabular` for numbers, `dimColor` for secondary text.
- **Colors per tool:** Bash `warning`, Edit/Write `suggestion`, Read/Grep/Glob `remember`, Web `permission`, Agent `claude`.

## Animated SVGs (SMIL)

Only with `isInteractive` on `Svg`. The animation lives in the markup, no redraw needed.

- Spin: `<animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="1.6s" repeatCount="indefinite"/>`.
- Bounce: `type="translate" values="0 0;0 -3;0 0"`.
- Blink: `<animate attributeName="ry" values="4.8;4.8;0.5;4.8" keyTimes="0;0.9;0.95;1" dur="3.2s" repeatCount="indefinite"/>`.
- Draw once: `stroke-dasharray="14" stroke-dashoffset="14"` plus `<animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.35s" fill="freeze"/>`.
- Shake: `translate` with `values="0 0;-1.6 0;1.6 0;-1.6 0;1.6 0;0 0"` and `fill="freeze"`.
- Sparks on impact: `opacity values="0;0;1;0" keyTimes="0;0.45;0.5;1"`, timed like the hammer swing.

## The worker (`mods/bro-cockpit/hooks/worker.ts`)

A small orange figure with a hard hat, three moods. Bouncing and breathing with a soft curve (`calcMode="spline"`), cup and steam with a dark outline or in grey, so they also show on a light background:

- `WORKER`: working. Bounces, blinks, swings a hammer, sparks.
- `SITTING`: done. Sits on a crate, coffee with steam, happy eyes, a rising heart.
- `SITTING_FAILED`: error. Sits exhausted, squeezed eyes, a drop of sweat.

Preview: open `docs/worker-preview.html` in a browser (dark and light background). The terminal shows `⚒`, `☕`, `✗`.

Tool symbols: a gear spins (running), a tick draws itself (done), a cross shakes (error). Only the three newest calls animate their result, older ones show a calm `✓` or `✗`.
