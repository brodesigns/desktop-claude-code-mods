# snippet-pane

Code snippets per project for Claude Code: save short commands and pieces of code and bring them back into the prompt box later. One pane, two commands. No model tokens.

- **Pane:** a list with title, language and a monospace preview of the first lines. `▸ all N lines` expands the full code. Each snippet has `↳ insert`, `⧉ copy`, `✕ delete`. With several languages, a filter at the top. At the bottom a field for new snippets (title on the first line, code below).
- **Insert:** puts the code as a Markdown code block at the cursor of the prompt box, without sending. If that fails, the code goes to the clipboard, otherwise it expands so you can select it.
- **Language:** taken from the code block (`` ```ts ``), otherwise guessed (sh, ts, js, py, php, html, css, json, sql, yaml, go, rust, md, else text).
- **No keys in the store:** code and title pass through a filter for known key patterns (tokens, API keys, private keys, quoted passwords) before they are saved. Matches are replaced by `[secret removed]`, the answer warns and the card shows `⚠ redacted`.

## Commands

- `/snippet <title>` and the code from the next line on, preferably as a code block with a language (`` ```ts ``).
- `/snippet <title> | <code>` for one-liners, e.g. `/snippet Build | npm run build`.
- `/snippets` opens the pane.

## Settings

- `previewLines` (preview lines, default 4): how many lines a collapsed snippet shows.

## Storage

In the plugin store (`$.store`, the user's config folder) under `snippets:project:<folder>:<hash of the project root>`. A worktree has its own root and therefore its own snippets.

## Limits

- The key filter only knows known patterns. It is an aid, not a guaranteed protection.
- Whether the prompt box accepts text and whether the clipboard works is up to the surface (according to the API not on remote surfaces). Not yet tried in the desktop app.
- The language is only roughly guessed. A code block with a language is more reliable.

Installation: `claude plugin install snippet-pane@desktop-claude-code-mods`, details in `../../README.md`.
