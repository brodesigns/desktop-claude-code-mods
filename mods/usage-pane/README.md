# usage-pane

A pane that shows what you use, what you never use and what it costs, to decide which skills, plugins and connectors to remove. No model tokens.

Four views, switched at the top:

- **Used:** counts per skill, plugin and connector (MCP server). A skill run counts (typed as `/name` or started by the Skill tool), every call of an MCP tool counts for its connector, and a plugin counts when one of its skills or its own MCP servers runs. Calls refused by a hook do not count. The toggle at the top right switches `this session` / `all sessions` (with `5m`, `3h`, `12d` since last use). Sort: most or least used first.
- **Unused:** what is installed but was never used (all sessions), biggest context cost first. This is the list to remove from.
- **Context:** everything installed with a rough token estimate (name plus description, about 4 characters a token) and its use count. A row with `0×` in yellow costs context and is never used. Plugins add up their skills and servers.
- **Tools:** built-in tools (Bash, Read, Edit, …): calls, failed calls (`✗`), calls refused by a hook (`⊘`) and average time, for this session or all sessions.

`↻ refresh` (Unused and Context) re-reads what is installed; the pane also does it at session start and on `/toolusage`. `Reset all` (all sessions) asks once more before it clears the stored counts.

Commands: `/toolusage` opens the pane (`/usage` is a built-in name).

Installation: `claude plugin install usage-pane@desktop-claude-code-mods`, details in `../../README.md`.

Limits:

- It counts only from the moment it is installed and only what it sees, so a new entry can look unused for a while.
- Skills and prompt commands from plugins and your own folders are listed; commands a plugin registers in code (bare names) are left out.
- The counts are kept in memory per call and written to the store once per turn and at the end of the session, so a crash can lose the last turn.
- The token numbers are estimates from names and descriptions. Tool schemas and tools loaded on demand are not counted.
- Plugins count only through their skills and own MCP servers; a plugin that only adds hooks never shows.
- It keeps at most 300 counts, up to 200 skills, 200 connectors and 200 plugins and 80 tools. Only names and numbers are stored, never arguments or output.
