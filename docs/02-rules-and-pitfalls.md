# 02 Rules and pitfalls

Everything here happened while building the mods in this repo. `validate` reports most of it right away.

## Structure

- **One hooks module per plugin.** A `hooks.json` with two entries is rejected. Fix: `register.tsx` imports the parts and calls them.
- **No call through a variable.** `for (const part of parts) part(on)` is rejected. Call every part directly: `git(on, options)`.
- **Pass `$` only to function declarations.** `export const start = async ($) => ...` from another file is rejected. Correct: `export async function start($: EngineInterface) {...}`.
- **Never the same event without a matcher twice.** `validate` rejects two `on('session.start', ...)` or two `on('tool.call', ...)` in different parts. Fix: one hook in `register.tsx` that calls the parts' functions one after another (`startX($)`, `begin($, e)`, `finish($, call, ran)`).
- **Do not shadow `next`.** A variable `next` inside the hook (`const next = ...`) is rejected. Use another name, for example `fresh`.
- **Reserved command names:** `/agents` and other Claude Code commands cannot be registered. The cockpit uses `/cockpit`.
- **Type contract:** every state key is listed in `types/index.d.ts`. If one is missing, `validate` fails.

## Behavior

- **No token cost:** only display and blocking hooks. No `prompt.compose`, no `$.tool.register`, no `$.agent.register`, no `CLAUDE.md` in the mod. Hooks that only block cost the short message, and only when they block. The one exception is `session-summary`: `$.model.complete` with `haiku`, a digest of a few hundred characters instead of the transcript, `maxTokens` 120, `effort: 'low'`, a `timeoutMs`, redacted input, and a setting to turn the automatic call off.
- **Claude Code does not seem to load a `CLAUDE.md` inside a plugin as context.** Prompt mods that rely on it probably do nothing. Not tested here.
- **Blocking without an endless loop:** a guard that blocks only on style or taste (never on secrets) remembers `path + content` of the denied calls and lets the identical retry through. Security guards block every time.
- **`agent.spawn`:** `await next(e)` returns `{ agentId }` after the start. Tool calls and `turn.complete` of the subagent carry the same `agentId`.
- **Time:** in hooks use `await $.clock.now()`, not `Date.now()`, for measurements that are tested.

## UI

- **Svg animation needs `isInteractive`.** Without it the graphic is a picture and SMIL stands still. Every interactive graphic is a frame of its own: use it sparingly (running calls yes, 60 rows no).
- **The terminal surface has no `Svg`.** Always provide a text stand-in (`⚒`, `☕`, `⚙`).
- **Lists: newest at the bottom.** Showing the newest on top pushes everything down with every new entry, and scrolling in the pane jumps. Append in order and add a button `$.ui.scroll({ in: <paneId>, to: 'end' })`.
- **Groups need stable keys.** Take the key from the oldest element, not from the newest.
- **One invalid prop blanks the whole pane.** The engine validates the returned tree. A fractional percentage width (`'48.5%'`), `alignSelf="stretch"`, a control character in a text or a tree deeper than 32 levels makes it skip the whole `ui.render` hook, and the pane shows "has not drawn". Use whole percentages, strip control characters from text that comes from outside (`printable()` in `hooks/keys.ts`), and mount every layout at several widths in a test (`views.test.tsx` uses 36, 50 and 80 columns).
- **Less is calmer:** one line per entry in fixed columns (`Box width={...}`), details on click. Bars, stripes and borders around every row looked messy.
- **All panes in one pane with tabs**, the current tab in the atom `cockpitTab`.

## Files and tools

- BSD `sed` (macOS) cannot handle `$` variables in a pattern: use an editor or Python for changes.
- `claude plugin test` only shows errors when every call the plugin makes is answered in the test.
- The folder `<mod>/.claude-plugin/types/` is written by the engine. Do not edit it by hand and do not commit it.

## Text in borders

- Text must never run past a border. Every box with `borderStyle` gets `overflow="hidden"`.
- In rows with `justifyContent="space-between"` put the left text into a box with `flexShrink={1} minWidth={0} overflow="hidden"` and set `wrap="truncate"`. Put the right part (status, graphic) into a box with `flexShrink={0}`.
- Graphics (`Svg`) have a fixed width: they belong in the `flexShrink={0}` box, so the text next to them gives way.

## Responsive

- Pane width in cells: `hooks/layout.ts` (`columns(e)`, `isNarrow(e)` below 44, `isWide(e)` from 68). The source is `e.props.bodyColumns`, the fallback `e.viewport.columns`.
- Narrow: smaller graphics (worker 32 instead of 44), short status words, drop file type tags and mini bars, smaller column widths.
- Rows with several groups: `flexWrap="wrap"`, tiles with `minWidth` and `flexGrow`.

## Closures and `$`

- A function that receives `$` must sit at the top level of the file (`async function guard($: EngineInterface, ...)`). `validate` rejects a `const guard = async ($, ...) => ...` inside `register`.
- State between calls (for example a `Set` of contents already blocked) then lives in a module variable at the top of the file.

## Sources and names

- Ideas from other people's mods are taken over only as ideas and get a name of their own.
- Check foreign code before every install.
- A secret guard names only the kind of find, never the value. The test builds the fake token from parts (`'gh' + 'p_' + 'a'.repeat(36)`), so the test file does not trigger the guard itself.

## Keeping data across sessions

- `$.state` and atoms last only for the session. For durable data use `$.store.get/set/delete/keys` (JSON, at most 4 MiB in total, in the user's config folder).
- One key per project, loaded once when the project changes (`loadProject`), every change written right away with `$.store.set`.
- In a test: `on('store.set', ...)`, `on('state.get', ...)` answering `{ value: { value, version } }` and `on('state.set', ...)` answering `{ value: { isSet: true, version } }`.

## Guards and errors

- **A guard's `.catch`:** `next.called ? next(e) : { deny: '...' }`. Calling `next(e)` in both branches lets the call through on every error in the guard. Test: send a call with a wrong field type (`content: 42`); the guard throws and the result must be `deny`.
- **Check every writing tool:** Write (`content`), Edit (`new_string`), MultiEdit (`edits[].new_string`), NotebookEdit (`new_source`), Bash (`command`). MultiEdit is not in the tool list of the types in engine 2.1.308, but the matcher `{ tool: /^MultiEdit$/ }` is still accepted; read its fields at run time.
- **Limit memory:** a `Set` of whole file contents grows without end. Use a key of length plus a short hash, at most 200 entries.
- **Never put secrets into the state:** whatever a hook keeps (commands, stderr) is redacted first with `redact` from `hooks/keys.ts`. A guard in another mod blocks independently, and the tool call may already be in the state by then.
- **Denied is not failed:** tool calls with `deny` get `isDenied`, not `isError`. The Errors tab counts only real failures (`isFailed` in `hooks/status.ts`).
- **`$.process.run` throws when the program is missing** (for example no git). Catch every call on its own, otherwise everything after it (here `loadProject`) never runs.
- **Polling without locks and without redraws:** `git --no-optional-locks ...`. Write values only when they change (JSON compare). Always reset a busy flag in `finally`.
- **A tab must not take the pane down:** every tab view in `register.tsx` runs inside `safe()` with try/catch and shows a card on error. The views are called directly through a `switch`, not through a variable.
- **Idea key:** `project:<folder>:<hash of $.session.root()>`. An older key `project:<folder>` is taken over on the first load and deleted. As a result a worktree has a different root and therefore its own ideas.
- **Honest replies:** slash commands report "saved" only when `$.store.set` ran.
- **Save animation:** only working workers get `isInteractive`, sitting ones are pictures. At most eight finished cards, the rest as a line "and N more". Clocks only tick while their tab is open (read `cockpitTab`).
- **Testing without `$.state`:** in a test, `$` has no `state`. For state checks answer `state.get` and `state.set` with a `Map` and read the map afterwards.

## Performance

Counted by reading the code, not measured in the app. Basis: whoever reads an atom while drawing is redrawn on every `set` to it (`$.state.set`, at most ten redraws per second). `update` always reads and writes, even for an equal value.

| Item | State |
|---|---|
| Reads in the head | 3 per draw (`cockpitTab`, `headCounts`, `gitInfo`), none twice |
| Overview tab | 1 more read (`headCounts`) |
| Writes per tool call | 3 (`begin` on `callList` and `callTotal`, `finish` on `callList`), 4 for Read, Write, Edit (`track` on `fileList`), +1 for subagents. Plus `headCounts` only when a number changes. So the head and the overview usually redraw once, only the tabs that show the list redraw on every write |
| Writes without change | none: `meter`, `gitInfo`, `headCounts` go through `setIfChanged` |
| git (band) | one process (`status`) every 15 s, plus `remote get-url origin` on the timer's poll only (never per tool call). The project (`rev-parse`, `loadProject`) only at start and when `$.session.cwd()` changes. Keeps running with the pane closed, because the band is always visible |
| Timers | the return value of `$.clock.every` is kept, a second `start` ends the old timer |
| Interactive graphics | at most 6 in the tree: head 1, tab 5 (`LIVE_MAX` in `style.tsx`), running states first. The context ring (Instruments) is a picture of its end state |
| Lists | all capped, only `ideaList` has no cap (user data, stored durably) |

### Rules

- **The head reads only `cockpitTab`, `headCounts`, `gitInfo`.** A new number in the head or the overview becomes a field in `HeadCounts` (`types/index.d.ts`) and is counted in `refreshCounts` (`hooks/counts.ts`). Call `refreshCounts($)` after every write to a counted list.
- **Never write what did not change.** Replaced values (polls, measurements) go through `setIfChanged(() => read($, a), v => update($, a, () => v), value)` from `hooks/state.ts`. Appending to lists stays an `update` with a function, otherwise concurrent calls get lost.
- **`read` and `update` only on atoms from the same file.** `validate` rejects `read($, target)` with an atom as a parameter. That is why `setIfChanged` takes two functions instead of the atom, and whoever reads `headCounts` declares the atom in their own file (import `EMPTY_COUNTS` as the start value).
- **No custom write buffer with a timer.** A buffer for `begin`/`finish` would need a `$.clock.after` per call, which is a dispatch itself and outweighs the saved write. The engine folds redraws to at most ten per second anyway.
- **Polls that only affect the pane pause without a pane.** Whether the pane is placed comes from `$.ui.panes()` with `isPlaced`. What the band also shows (git) keeps running.
- **At most 6 interactive graphics in the tree.** New animation only for a running state and within a budget (`LIVE_MAX`). Draw a graphic that only fades in once as a picture with its end state in the markup, otherwise the picture shows the beginning (an empty ring).
- **Detect a project change through `$.session.cwd()`**, do not work it out again on every poll.

## Design system and view tests

- **`validate` does not check types.** A wrong box property (for example `flexBasis`, which does not exist) passes. Type check with `tsc` and the types from `<mod>/.claude-plugin/types/`, see [01](01-basics.md).
- **No fragment inside a text.** `<>...</>` is a column box. Pass several parts in one line of text as an array: `cardHead(ui, 'h', [statusDot(...), name])`.
- **New building blocks only in `hooks/style.tsx`.** Tabs build no tiles, cards or empty states of their own; sizes through `TYPE`, spacing through `SPACE`, colors through roles.
- **Testing views:** `$.ui.mount({ plugin, component: 'Pane', requestId, props: { bodyColumns, ... }, surface })` with a `state.get` that returns the tab for `cockpitTab` and otherwise `undefined` (start value) or test data. No `session.start` needed, so no polls in the test. Without a match `ui.find` returns `null`, not `undefined`: check with `!= null`, because `toBeDefined()` is always green. A counter test with broken data (`meter: { percent: 5 }`) shows that the error card is found.
- **Empty field in a tile:** `·`, not a dash.
