# permission-log

A pane that logs your permission prompts: which ones you allowed, which ones you declined, and which you keep allowing, so you can add a rule and stop being asked. No model tokens.

- **Log:** every prompt where a person is asked counts for its rule (the engine's own suggestion, for example `Bash(git push:*)`). It counts as allowed when the tool ran afterwards and as declined when it did not run or came back refused. Calls refused without asking (by a rule or the auto-mode classifier) count as asked and declined.
- **★ Worth allowing:** rules you allowed at least 3 times and never declined, most allowed first. **All asked** lists every rule, most asked first.
- **A click on a rule** opens a card with an example (redacted), the counts and when it was last asked. `⧉ copy rule` puts the rule on the clipboard; add it under `permissions.allow` in `.claude/settings.json` yourself. This mod changes no settings.
- **Scope:** `this session` or `all sessions` (kept in the plugin store, written once per turn and at the end of the session). `Reset all` asks once more before it clears the stored counts.
- **Commands:** `/permlog` opens the pane.

Installation: `claude plugin install permission-log@desktop-claude-code-mods`, details in `../../README.md`.

Limits: it counts only from the moment it is installed, and only prompts, so calls your rules already allow never show. Allowed and declined are read from the order of events (prompt, then tool run or not), not from the dialog itself, and a prompt the engine answers differently from that order can be miscounted. Commands and file names are redacted for known key patterns; a rule that held a secret cannot be copied. It keeps at most 150 rules. Only rules, short examples and numbers are stored.
