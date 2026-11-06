# secret-guard: stop Claude Code from writing secrets

A guard hook for Claude Code that stops Claude from writing credentials in plaintext into files or shell commands. Hooks only, no interface, no model tokens.

**What is blocked:** `Write`, `Edit`, `MultiEdit`, `NotebookEdit` and `Bash` when the content matches one of these patterns:

- API keys (`sk-`, Stripe `sk_live_` and `rk_live_`, Google, AWS), GitHub, GitLab, npm and Slack tokens, JSON web tokens, bearer tokens
- private keys (PEM header, also PGP blocks)
- a real-looking password inside a connection URL (the part between the colon and the at sign)
- plaintext credentials such as `password = "..."`, a JSON `"password"` key, `DB_PASSWORD=...`, `export API_KEY=...` or `token: '...'`

A value counts only when it looks real: placeholders (`YOUR_TOKEN_HERE`), references (`${API_KEY}`, `process.env.KEY`) and short plain words pass.

The message names only the kind of secret, never the value. A match is blocked on every attempt. If the guard itself fails, the call is blocked to be safe. Only `node_modules/` and `.env.example` are skipped. That includes `.env` files: the guard also stops Claude from writing a real key into one, so put real values there yourself.

**Limits:** the guard is a safety net, not a guarantee. It reads the text of one tool call at a time, so these pass: values that are encoded (`echo <base64> | base64 -d > .env`), split or concatenated (`"s" + "k-" + ...`), assembled over several edits that each stay short, and anything written by a tool outside its matcher (an MCP file tool, PowerShell). Passwords shorter than eight characters, unknown token formats and values read from variables (`$TOKEN`) pass on purpose or by design. Input you type yourself in the terminal and files written by other programs are not seen by the guard. A block repeats on every attempt, so if a harmless line is blocked, remove the value-like part or build it from parts.

Installation: `claude plugin install secret-guard@desktop-claude-code-mods`, details in the [main README](../../README.md).
