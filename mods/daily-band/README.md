# daily-band

Band above the prompt with today's totals, summed over every session of the day. No model tokens.

```
☀ Today: 2 h 10 min · ≈ $4.20 · 38 Turns · 5 Commits
```

- **Working time:** sum of the turn durations (main loop only; subagents run in parallel and are not counted twice).
- **Cost:** what `/cost` computes for the sessions, in US dollars, hence the `≈`. The amount uses your system's number format. On a subscription this is the API equivalent, not a bill.
- **Turns** and **commits** from today in the current project (`git rev-list --since=midnight`, own email from `git config user.email`). Commits only show when there are some.
- **Across sessions:** each session writes only its own entry per day to the plugin store, and the band sums all of today's entries (once a minute and after every turn). A new day starts at midnight, entries older than 7 days are deleted.
- **No turn today:** the band stays empty.

Settings (`/config`): `show` (show the band, default on; off still keeps counting), `commits` (count commits, default on).

Installation: `claude plugin install daily-band@desktop-claude-code-mods`, details in `../../README.md`.

Limits: cost a session had before the mod loaded does not count (so a resumed conversation is not counted twice either). A turn across midnight counts entirely toward the new day. Commits count only in this session's project, not in other repos.
