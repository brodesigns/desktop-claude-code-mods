# 02 API overview

Complete reference: the types the engine writes to `<mod>/.claude-plugin/types/`, and the `plugin-authoring` skill. This page covers only what was needed while building.

## Hook shape

```ts
on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
  // $ engine, e input (frozen), next(e) calls the hooks below and the engine
  return next(e)                       // let it through
  // return { deny: 'reason' }         // block, without next
  // return next({ ...e, command })    // rewrite
})
```

Matchers: `on(event, { tool: 'Write' }, hook)`, `{ command: 'x' }` for `command.run`, `{ component: 'Pane', requestId: 'id' }` for `ui.render`. `.catch(($, e, next) => ...)` catches errors in the hook.

## Events used

| Event | Purpose | Important fields |
|---|---|---|
| `session.start` | register commands, open the pane, start timers | `e.cwd`, `e.surface` |
| `tool.call` | see, block or rewrite a tool call | `e.tool`, `e.tool_use_id`, `e.agentId`, flat arguments such as `e.command`, `e.file_path`, `e.content`, `e.new_string` |
| `agent.spawn` | a subagent starts | `e.subagentType`, `e.description`, `e.background`, result `{ agentId }` |
| `turn.complete` | a turn or a subagent loop ends | `e.agentId`, `e.reason`, `e.durationMs`, `e.answer` |
| `prompt.submit` | change the prompt | `e.text` |
| `command.run` | own slash command | `e.args`, result `{ text }` |
| `ui.render` | drawing | `component: 'Pane'` or `'AbovePrompt'` |
| `ui.scroll` | move a pane's window | `offset` |

Others: `prompt.compose` (costs tokens, avoid it), `tool.check`, `session.end`, `session.measure`, `turn.step`, `config.set`.

## The `$` interface (noun, then method)

- `$.command.register({ name, description })` in `session.start`. Reserved names (for example `/agents`) are rejected.
- `$.ui.open({ id, title })` opens a pane. `$.ui.status(text)` sets the status line (one per mod). `$.ui.toast(text)`, `$.ui.notify(text)`, `$.ui.scroll({ in, to: 'end' })`.
- `$.ui.resolve(e)` returns the elements of the surface (`e.surface`: terminal, desktop, vscode, mobile).
- `$.process.run([argv...], { timeoutMs, cwd })` runs a command (no shell). Result `{ exitCode, stdout, stderr }`. Git runs with repository hooks turned off.
- `$.clock.now()`, `$.clock.every(ms, fn)`, `$.clock.after(ms, fn)`, `$.clock.sleep(ms)`.
- `$.fs` (read, write, list, `stat`), `$.http.fetch`, `$.audio.play({ asset })`, `$.store` (across sessions), `$.state` (session), `$.session.usage()` (context, limits, cost), `$.agent.list()`.
- The type of `$`: `EngineInterface`. Inputs: `ToolCallInput`, `ToolCallResult`, `RenderInput`.

## State: atom, read, update

```ts
import { atom, read, update } from 'claude-code'
const calls = atom({ plugin: 'my-mod', key: 'callList' } as const, [])
const list = await read($, calls)            // while drawing
await update($, calls, l => [...l, x])       // from a handler or another event; redraws the readers
```

Every key is listed in the type contract `types/index.d.ts` under the mod name in `interface PluginState`. `validate` checks this. Two files can share the same atom through the same name and key.

## Elements (desktop table)

`Box, Text, Button, Input, Select, Svg, Link, Code, Markdown, Client`. The terminal has no `Svg`, no `Input` and no `Select`: check with `'Svg' in ui` before using Svg.

- `Box`: `flexDirection, gap, padding(X/Y/Left...), margin..., width, height, flexGrow, flexShrink, flexWrap, alignItems, justifyContent, borderStyle ('round'), borderColor, backgroundColor, key, hover, position`. Spacing as a number (cells) or `'xs'|'sm'|'md'|'lg'|'xl'`.
- `Text`: `color, dimColor, size ('caption'|'footnote'|'body'|'heading'|'title'), weight, mono, tabular, bold, italic, wrap ('truncate' and others)`. Strings inside a Box become Text automatically.
- `Button`: `label, onPress, variant ('primary'|'secondary'), plain, key, hotkey`. Every button needs a unique `key`.
- `Svg`: `source, alt (required), width, height, isInteractive`. SMIL animations only run with `isInteractive` (sandbox frame, no script).
- Colors: theme keys (`text, inactive, subtle, suggestion, remember, success, error, warning, claude, permission`, ...) or raw color values.

## Drawing slots

- `{ component: 'Pane', requestId: <id> }`: the pane body. The engine scrolls it itself (`e.props.scroll`, `e.viewport.rows`).
- `{ component: 'AbovePrompt' }`: band above the prompt. Return `next(e)` when there is nothing to show. Do not draw when `e.props.hasSurvey` is set.
- There are NO other slots. The sidebar and the session overview cannot be reached, see [07](07-limits.md).
