# port-band

Band above the prompt: which local dev servers are listening right now. One line in a round frame, for example `⇄ :3000 node · :5173 vite`. No model tokens.

- **Display:** port and process name, sorted by port. If only a runtime such as `node`, `bun`, `deno` or `python` runs on a known port, the usual name stands there (5173 and 4173 `vite`, 4200 `angular`, 6006 `storybook`, 8888 `jupyter`). Narrow windows show the ports only.
- **Empty:** if none of the ports is listening, no band appears. It steps back for a survey above the prompt. A band from another mod (for example the git band from bro-cockpit) stays beneath it.
- **Settings** (`/config`):
  - `ports`: comma separated list, default `3000,3001,4200,5000,5173,8000,8080,8888`. With `all` (or `*`) the band shows every own port from 1024 up (only processes whose names the program may see, so your own).
  - `intervalSeconds`: poll every 15 seconds, adjustable from 5 to 300.
- **Commands:** none.

Installation: `claude plugin install port-band@desktop-claude-code-mods`, details in `../../README.md`.

Limits: the band runs `lsof -nP -iTCP -sTCP:LISTEN` every 15 seconds, or `ss -ltnp` without lsof. If both are missing, the band stays off and looks again only about every five minutes. A poll may take at most 5 seconds, a hanging poll does not block the next one and two never run at once. TCP only, this computer only. Windows has neither lsof nor ss, so the band stays off there. `lsof` shortens long process names.
