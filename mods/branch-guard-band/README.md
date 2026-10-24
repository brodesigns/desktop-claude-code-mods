# branch-guard-band

Band above the prompt: warns when you work directly on a protected branch. Display only, blocks nothing. No model tokens.

- **Display:** red border with `⚠ You are working directly on main`, followed by the hint `New branch: git switch -c <name>`. On all other branches, with a detached HEAD and outside git the band is hidden.
- **When:** a `git symbolic-ref HEAD` in the project every 15 seconds, and right after every Bash command by Claude that contains `git`.
- **Settings:** `branches` (default `main,master`, comma separated, `*` as wildcard, e.g. `release/*`), `hint` (show the hint, default on).

Installation: `claude plugin install branch-guard-band@desktop-claude-code-mods`, details in `../../README.md`.

Limits: the band only warns, it stops no commit and no push. A branch switch outside Claude shows with the next check, so after 15 seconds at most.
