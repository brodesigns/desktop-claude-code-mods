# prompt-library

A prompt library for Claude Code: save a prompt once and reuse it in every project. One pane with search, plus three commands. No model tokens.

- **Pane:** a list with name, first line and the buttons `↳ use`, `▸ full text`, `✕ delete`. Expanded, it also shows `⧉ copy` and `↵ send`. Search at the top (name and text), a field for new prompts at the bottom with a choice of "all projects" or "only this project".
- **Use:** puts the prompt into the prompt box without sending it (`$.prompt.fill`). If that fails, the text goes to the clipboard. If that fails too, the card expands and shows the full text to copy; `↵ send` then sends it directly as a prompt of its own.
- **Placeholders:** `{{file}}` in the text. When you use the prompt from the pane, the card asks for the values. Empty values stay as `{{…}}` in the text.

## Commands

- `/prompt-save <name>: <text>` saves for all projects. The text may span several lines. The same name replaces the old prompt.
- `/prompt-save --project <name>: <text>` saves for the current project only.
- `/prompts [search]` opens the pane, optionally already filtered.
- `/p <name> [value | value]` puts the prompt into the prompt box. Values fill the placeholders in order. Without placeholders the rest is appended as a paragraph of its own (`/p review src/app.ts`).

Name: at most 40 characters, without `:` and `|`. Project prompts win over global ones with the same name.

## Storage

In the plugin store (`$.store`, the user's config folder): `prompts:global` for all projects, `prompts:project:<folder>:<hash of the project root>` per project. A worktree has its own root and therefore its own project prompts.

## Limits

- Whether the prompt box accepts text is up to the surface. If it draws its own input field, the engine answers `no_composer` according to the API; the clipboard does not work on remote surfaces yet either, according to the API. What remains then is the text to copy and `↵ send`. Not yet tried in the desktop app.
- `↵ send` starts a turn of its own with the prompt as the person's own words (`$.prompt.submit`) as soon as the session is idle. That costs tokens like a typed prompt.
- Text that looks like a key is redacted before it is saved. This is an aid, not a guaranteed protection.
- When the prompt box refuses, `/p` shows the full text as the command's output; the model reads it along with the next turn.

Installation: `claude plugin install prompt-library@desktop-claude-code-mods`, details in `../../README.md`.
