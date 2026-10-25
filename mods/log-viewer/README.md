# log-viewer

A pane with the output of the latest Bash calls in this session. No model tokens.

- **Entries:** one entry per Bash call with command, status (`exit 0`, `exit 1`, `blocked`, `interrupted`, `background`) and duration. Newest at the bottom; the newest is expanded and shows its output. A click on another command expands its output.
- **Highlighting:** lines with `error`, `failed`, `fatal`, `exception` are red, lines with `warn`, `deprecated` yellow. Lines from stderr are dimmed.
- **Header:** `Logs` on the left; on the right `N · ✗ M` (entries · failed) and a small blue toggle `✗ errors only` / `all`. Errors only means an exit code other than 0 and interrupted calls; blocked ones do not count as errors.
- **Search:** a field filtering by text in the command or the output (and showing only the matching output lines). It appears from 8 entries on, or while a search is active; `×` clears it.
- **Open output:** `⧉ copy output` copies the kept (redacted) lines, `↳ command` puts the command into the prompt box (without sending), or onto the clipboard if the box refuses. A short line says what happened.
- **Actions:** `↓ to bottom` jumps to the end of the pane, `Clear` empties the list.
- **Commands:** `/logs` opens the pane.

Installation: `claude plugin install log-viewer@desktop-claude-code-mods`, details in `../../README.md`.

Limits: the pane only shows what ran through the Bash tool in this session and runs no programs itself. It keeps the last 40 calls, output only for the newest 10, each at most the last 120 lines of up to 300 characters. Commands and output are redacted for known key patterns before they are kept; this is an aid, not a guaranteed protection. The exit code of a failed call is read from the error message (`Exit code N`); without that line the status is just `error`. For commands in the background, later output does not arrive. A Bash call whose tool fails with an exception is marked `error` ("Tool failed") instead of staying `running`.
