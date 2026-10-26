# secret-guard: stop Claude Code from writing secrets

A guard hook for Claude Code that stops Claude from writing credentials in plaintext into files or shell commands. Hooks only, no interface, no model tokens.

**What is blocked:** `Write`, `Edit`, `MultiEdit`, `NotebookEdit` and `Bash` when the content matches one of these patterns:

- API keys (`sk-`, Stripe `sk_live_`, Google, AWS), GitHub and Slack tokens, bearer tokens in an Authorization header
- private keys (PEM header)
- plaintext credentials such as `password = "..."`, `api_key: '...'` or `token = "..."`

The message names only the kind of secret, never the value. A match is blocked on every attempt. If the guard itself fails, the call is blocked to be safe. Only `node_modules/` and `.env.example` are skipped. That includes `.env` files: the guard also stops Claude from writing a real key into one, so put real values there yourself.

**Limits:** only known patterns are detected. Unknown formats, split or encoded values and values read from variables (`$TOKEN`) pass through. Input you type yourself in the terminal and files written by other programs are not seen by the guard.

A helper, not guaranteed protection.

Install: `claude plugin install secret-guard@desktop-claude-code-mods`. More in the [main README](../../README.md).
