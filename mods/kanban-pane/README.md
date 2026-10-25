# kanban-pane

A small kanban board per project for Claude Code: Open, In progress, Done. One pane, two commands. No model tokens.

- **Pane:** a light board, one line per card: `○ text` (cut off on the right) and a blue `›` that moves the card to the next column. In the last column a `✓` marks it done. A click on the text opens the card: full text, `‹ back` and `✕ delete`. Columns are stacked section lines with a count (`○ Open  3`). An empty board shows only a short hint.
- **Done:** cards finished more than 14 days ago are folded away (`▸ N older than 14 days`). The count includes them. At most 200 Done cards are kept, the oldest go first.
- **New card:** `＋ new` in the pane header opens the input field (it closes after saving), or use `/card`.
- **Notes:** the line about the last action disappears after 8 seconds.
- **Several sessions:** a card is matched by id and creation time, so a stale pane never moves or deletes another session's new card.

## Commands

- `/card <text>` adds a card to Open. Several lines make several cards, a leading `- ` or `* ` is dropped.
- `/kanban` opens the board.

## Settings

- `doneDays` (fold Done after days, default 14).

## Storage

In the plugin store (`$.store`, the user's config folder) under `kanban:project:<folder>:<hash of the project root>`. A worktree has its own root and therefore its own board.

## Limits

- Cards are plain text up to 300 characters, without due dates, manual ordering or assignees.
- Text that looks like a key is redacted before it is saved. This is an aid, not a guaranteed protection.
- Delete does not ask for confirmation.
- Done is capped at 200 cards.

Installation: `claude plugin install kanban-pane@desktop-claude-code-mods`, details in `../../README.md`.
