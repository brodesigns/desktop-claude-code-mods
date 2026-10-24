# todo-band

Band above the prompt: counts `TODO`, `FIXME`, `HACK` and `XXX` in the files currently being worked on. No model tokens.

- **Display:** one line, e.g. `☐ 3 TODO · 1 FIXME in 2 files`, followed by the affected files. Yellow as soon as anything other than `TODO` is found. With 0 hits the band is hidden.
- **Which files:** everything `git status` reports as modified, added or untracked, plus the files Claude wrote in this session with Write, Edit, MultiEdit or NotebookEdit (also outside git).
- **When:** a `git status` in the project every 20 seconds, and right after every write by Claude. Only files whose size or modification time changed are read again.
- **Settings:** `markers` (default `TODO,FIXME,HACK,XXX`), `sessionFiles` (count session files too, default on).

Installation: `claude plugin install todo-band@desktop-claude-code-mods`, details in `../../README.md`.

Limits: only whole upper-case words count, `todo` in prose does not. At most 200 files per run, each up to 512 KiB; binary files and lockfiles are skipped. Deleted files do not count. The list of session files starts over after the mod reloads.
