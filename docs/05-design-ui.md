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

Tab order: Overview (start), Files, Subagents, Tool calls (what happens in the session), Instruments, Errors (health), Todo (todo.md checklist and code markers), Project (info, scripts, ideas and change requests).

Files tab: shows read files (`▤ read ×N`, tool Read) and changed files (`✎ changed ×N`, `◧ new`), filters All, Changed, Read only.

## Bands above the prompt

Every band is one borderless, small row (`paddingX="sm"`), so seven bands cost seven lines, not three each. A band is a plain `Button` around `Text` parts, so the whole row is clickable. Brand accent `#39639E` (BroDesigns blue) as the `▌` marker at the left; text uses `caption` size and the theme's text colour; `warning`/`error` roles only for a real problem.

Git band (`hooks/git.tsx`): `▣ Project ⎇ branch ✓ All committed` or `● N changes (M staged)`, `↑ N to push`, `↓ N to pull`. Narrow: short words. Every part is its own button: the project opens its folder in the file manager, the branch opens its page on GitHub (only a `github.com` remote, address built by `hooks/git-url.ts`; otherwise the branch name is copied), `↑`/`↓` open the branch's commit list, the state opens the cockpit. Other bands: the env band shows a file in the file manager, the limit band opens the usage page, the branch guard copies `git switch -c `, daily and deadline are display only. Targets are opened with `open` or `xdg-open` as an argument vector, never through a shell.

Band rules (from the review):

- **Structure:** the `▌` marker sits in `<Box flexShrink={0}>`, the main part in `<Box flexShrink={1} minWidth={0} overflow="hidden">`, every `Text` has `wrap="truncate"`, the row has `gap="sm"`. Without it a long text grows the band to two or more rows.
- **Narrow:** below `bodyColumns < 44` for every band. Drop the least important parts first (daily: turns and commits go, time and cost stay).
- **Colour:** state colours only for real problems. A permanent state such as "on main" is `warning`, never `error`. A missing optional value (no environment name) shows no warning text.
- **Clicks:** plain Buttons that copy, show a toast or open something. A toast about a date shows the full date with the year and how to clear it.
- **Openers:** argument vectors, no shell. macOS reveals a file with `open -R`; Linux opens the containing folder, never the file itself.
- **Polling:** a poller that spawns a process (git) is serialised with a busy/due loop and runs only at start, on the slow tick and after a relevant tool call, never on every turn. A cached view of the plugin store needs an explicit re-read on the tick, because another session can change the store.
- **Dates:** "today" and "tomorrow" use calendar arithmetic (`new Date(y, m, d + 1)`), never `now + 24 h`.

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
