# Contributing

- **Issues:** report bugs and ideas as an issue with your Claude Code version, the surface (desktop app or terminal) and a short description. Do not report security problems publicly, see [SECURITY.md](SECURITY.md).
- **Pull requests:** keep them small, one topic per pull request.
- **Tests must pass:** for every changed mod run `claude plugin validate mods/<name>` and `claude plugin test mods/<name>`. New features get a test.
- **Rules:** [docs/03-rules-and-pitfalls.md](docs/03-rules-and-pitfalls.md) is binding: one hooks module per plugin, `$` only passed to top-level function declarations, no model tokens, and the performance rules.
- **Language:** Everything in this repository is written in English: interface texts, docs, code, comments, names, tests and commit messages.
