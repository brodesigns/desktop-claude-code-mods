# env-band

Band above the prompt: shows which environment is active in the project and which `.env` files exist. No model tokens.

- **Display:** one row, e.g. `◉ development .env.local .env`. Red for `production` (also `prod`, `live`), yellow for `staging` (also `stage`, `preprod`, `uat`), calm otherwise. If no file names an environment, only the dim file buttons show (`◉ .env.local · .env`), with no warning wording. More files than shown add a dim `+N`. Long text is cut, the band stays one row. Without `.env` files the band is hidden.
- **Click:** a file name shows the file in Finder (macOS, `open -R`) or opens its folder (Linux, `xdg-open <folder>`); the content is never opened.
- **Source:** `.env`, `.env.local`, `.env.production` and every other `.env.*` in the session's project folder. The name comes from `NODE_ENV`, `APP_ENV` or `ENV`, looked up in the files in this order: `.env.local`, `.env`, `.env.<mode>.local`, `.env.<mode>`.
- **Privacy:** only the environment name and the file names are shown. No other value is displayed or stored, and the name only when it is a plain word (no URL, no `${...}` interpolation). `.env.keys` and `.env.vault` are only listed, never read.
- **When:** a look into the project folder every 30 seconds, and right away when Claude writes a `.env` file. Only files whose size or modification time changed are read again.
- **Settings:** `variables` (default `NODE_ENV,APP_ENV,ENV`, the first one found wins), `ignoreTemplates` (skip `.env.example`, `.env.sample`, `.env.template`, `.env.tpl`, `.env.dist`, default on).

Installation: `claude plugin install env-band@desktop-claude-code-mods`, details in the [main README](../../README.md).

Limits: the band reads only the files, not the environment of the running process. Which file a framework really loads depends on the framework and the mode; the order above is an estimate, not a copy of any framework. Only the project folder itself is searched, no subfolders. At most 20 files, each up to 256 KiB.
