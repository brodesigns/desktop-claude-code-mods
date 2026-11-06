# usage-pane

A pane that counts which skills, plugins and connectors (MCP servers) are used, to decide what to remove. No model tokens.

- **Counted:** every skill run (typed as `/name` or started by the Skill tool), every call of an MCP tool (the connector is the server), and a plugin whenever one of its skills or its own MCP servers runs. Refused calls do not count.
- **Scope:** the toggle at the top right switches between `this session` and `all sessions`. All-sessions numbers are kept in the plugin store and show when an entry was last used (`5m`, `3h`, `12d`).
- **Tabs:** Skills, Plugins, Connectors, each with the number of entries.
- **Sorting:** `↓ most used first` or `↑ least used first` (ties: idle longest first). The bottom of the second list is what to remove.
- **Reset:** under `all sessions`, `Reset all` asks once more before it clears the stored counts.
- **Commands:** `/toolusage` opens the pane (`/usage` is a built-in name).

Installation: `claude plugin install usage-pane@desktop-claude-code-mods`, details in `../../README.md`.

Limits: it counts only from the moment it is installed and only what it sees, so it cannot list things that were never used (it does not know what is installed). Plugins count only through their skills and own MCP servers; a plugin that only adds hooks or commands never shows. Keeps at most 300 entries (the idle longest are dropped first). Only names and numbers are stored, never arguments or output.
