# prompt-library

A prompt library for Claude Code: save a prompt once and reuse it in every project. One pane with search, plus three commands. No model tokens.

- **Pane:** a light list, one line per prompt: the name, `▣` for project prompts. `↳` uses it at once. A click on the name opens the text with `⧉ copy`, `↵ send` and `✕ delete` (and the fields for placeholders; where a surface draws no input field, the opened prompt shows the `/p <name> value | value` form instead and `↳` uses the text at once). `＋ new` opens a field for a new prompt with a choice of "all projects" or "only this project". The search field appears from 6 prompts on. After a successful save the field closes. Feedback notes disappear after 8 seconds or when `＋ new` is toggled.
- **Use:** puts the prompt into the prompt box without sending it (`$.prompt.fill`). If that fails, the text goes to the clipboard. If that fails too, the entry expands and shows the full text to copy; `↵ send` then sends it directly as a prompt of its own.
- **Placeholders:** `{{file}}` in the text. When you use the prompt from the pane, the opened entry asks for the values. Empty values stay as `{{…}}` in the text.

## Commands

- `/prompt-save <name>: <text>` saves for all projects. The text may span several lines. The same name replaces the old prompt.
- `/prompt-save --project <name>: <text>` saves for the current project only.
- `/prompts [search]` opens the pane, optionally already filtered.
- `/p <name> [value | value]` puts the prompt into the prompt box. Values fill the placeholders in order. Without placeholders the rest is appended as a paragraph of its own (`/p review src/app.ts`).

Name: at most 40 characters, without `:` and `|`, and not something that looks like a key (it is rejected, since names are not redacted). Project prompts win over global ones with the same name.

## Storage

In the plugin store (`$.store`, the user's config folder): `prompts:global` for all projects, `prompts:project:<folder>:<hash of the project root>` per project. A worktree has its own root and therefore its own project prompts.

## Several sessions

After every turn both lists are re-read from the store (the global list is shared by all projects), so prompts added or deleted in another session show up. A delete removes only the entry with the same id and creation time.

## Limits

- Whether the prompt box accepts text is up to the surface. If it draws its own input field, the engine answers `no_composer` according to the API; the clipboard does not work on remote surfaces yet either, according to the API. What remains then is the text to copy and `↵ send`. Not yet tried in the desktop app.
- `↵ send` starts a turn of its own with the prompt as the person's own words (`$.prompt.submit`) as soon as the session is idle. That costs tokens like a typed prompt.
- Text that looks like a key is redacted before it is saved. This is an aid, not a guaranteed protection.
- When the prompt box refuses, `/p` shows the full text as the command's output; the model reads it along with the next turn.

Installation: `claude plugin install prompt-library@desktop-claude-code-mods`, details in the [main README](../../README.md).
