# permission-log

A pane that logs your permission prompts: which ones you allowed, which ones you declined, and which you keep allowing, so you can add a rule and stop being asked. No model tokens.

- **Log:** every prompt where a person is asked counts for its rule, the one Claude Code itself suggests (for example `Bash(git push:*)`). It counts as allowed when the tool ran afterwards (even if the tool then failed) and as declined when the call came back refused. Calls refused without asking (by a rule or the auto-mode classifier) count as asked and declined. Prompts in hosts nobody can answer (`-p`) and prompts left open when a turn ends are not counted.
- **★ Worth allowing:** rules you allowed at least 3 times and never declined, most allowed first. A prompt Claude Code made no rule suggestion for is logged under a label such as `Bash · git` and is never offered. Rules for a whole sensitive tool (`Bash`, `Read`, `Edit`, `Write`, `WebFetch`) or for commands that run other code or delete (`rm`, `curl`, `sh`, `python`, `sudo`, …) are never offered either. **All asked** lists everything, most asked first.
- **A click on a rule** opens a card with an example (redacted), the counts and when it was last asked. `⧉ copy rule` puts the rule on the clipboard (one rule a line); add it under `permissions.allow` in `.claude/settings.json` yourself. This mod changes no settings.
- **Scope:** `this session` or `all sessions` (kept in the plugin store, written once per turn and at the end of the session). `Reset all` asks once more before it clears the stored counts.
- **Commands:** `/permlog` opens the pane.

Installation: `claude plugin install permission-log@desktop-claude-code-mods`, details in the [main README](../../README.md).

Limits: it counts only from the moment it is installed, and only prompts, so calls your rules already allow never show. Allowed and declined are read from the order of events (the prompt happens inside the tool call, then the call returns or comes back refused), not from the dialog itself. A person's "no" is recognized by a hook's deny or the engine's rejection wording, so another wording would count as allowed. Hooking permission prompts keeps the mod on the engine's list of mods that block Code Mode tool calls. Commands and file names are redacted for known key patterns; a rule that held a secret cannot be copied. It keeps at most 150 rules. Only rules, short examples and numbers are stored.
