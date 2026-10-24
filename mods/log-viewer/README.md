# log-viewer

A pane with the output of the latest Bash calls in this session. No model tokens.

- **Entries:** one entry per Bash call with command, status (`exit 0`, `exit 1`, `blocked`, `interrupted`, `background`) and duration. Newest at the bottom; the newest is expanded and shows its output. A click on another command expands its output.
- **Highlighting:** lines with `error`, `failed`, `fatal`, `exception` are red, lines with `warn`, `deprecated` yellow. Lines from stderr are dimmed.
- **Filter:** `All` or `Errors only` (exit code other than 0, and interrupted calls; blocked ones do not count as errors). Plus a search field: it filters by text in the command or the output and shows only the matching lines of the output.
- **Actions:** `↓ to bottom` jumps to the end of the pane, `Clear` empties the list.
- **Commands:** `/logs` opens the pane.

Installation: `claude plugin install log-viewer@desktop-claude-code-mods`, details in `../../README.md`.

Limits: the pane only shows what ran through the Bash tool in this session and runs no programs itself. It keeps the last 40 calls, output only for the newest 10, each at most the last 120 lines of up to 300 characters. Commands and output are redacted for known key patterns before they are kept; this is an aid, not a guaranteed protection. The exit code of a failed call is read from the error message (`Exit code N`); without that line the status is just `error`. For commands in the background, later output does not arrive.
