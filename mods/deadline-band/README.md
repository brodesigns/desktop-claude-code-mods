# deadline-band

Band above the prompt with the countdown to the project's deadline. The deadline is kept per project across sessions (plugin store). No model tokens.

```
⏳ Release in 3 days 4 h · Sun Nov 1
```

- **Colour by urgency:** 3 days or less is a warning, 1 day or less and overdue is an error (`⚠`). Overdue reads `overdue by 2 h`.
- **No deadline:** the band stays empty.
- **Project** is the folder of the main repository (also from a worktree), without git the session's project folder. Found with `git rev-parse --git-common-dir` at session start, after the session's folder changes, and on each `/deadline`.

## Commands

- `/deadline 2026-11-01`, `/deadline 1.11.2026`, `/deadline 1.11.` (day first; without a year: the next November 1), also `today`, `tomorrow`
- with time and text: `/deadline 1.11. 14:00 Release`, `/deadline 1.11. at 2pm Handover`, `/deadline 2026-11-01T09:30 Go`
- `/deadline` shows the deadline that is set, `/deadline off` deletes it

Without a time the end of the day applies (23:59). Without text it is called "Deadline". The command only reports "Saved" when the plugin store accepted the value; a date that does not exist (31.2.) is refused.

Setting (`/config`): `fromDays`, show the band only this many days ahead (default 0, always).

Installation: `claude plugin install deadline-band@desktop-claude-code-mods`, details in `../../README.md`.

Limits: one deadline per project. All times are the computer's local time. A repository that is moved gets a new key and loses its deadline.
