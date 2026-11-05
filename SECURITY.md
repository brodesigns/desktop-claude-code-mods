# Security

## Report a security problem

Please do not report security problems in a public issue. Use [private vulnerability reporting](https://github.com/brodesigns/desktop-claude-code-mods/security/advisories/new) on GitHub or send an email to `contact@brodesigns.de`, and describe which mod is affected, which Claude Code version you use and how to reproduce the problem.

We reply as soon as possible and credit you in the changelog if you like.

## What counts as a security problem

- The guard (`secret-guard`) lets through a call that it should block according to its description.
- A mod stores or shows a secret in plaintext.
- A mod runs a program or makes a network request that its README does not name.

The guards are helpers, not guaranteed protection. A pattern they do not know is usually not a security problem but a wish for an issue.
