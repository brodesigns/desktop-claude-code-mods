# dependency-pane

A pane with the project's dependencies and their declared version ranges. No model tokens.

- **Sources** in the project folder: `package.json` (dependencies, devDependencies, peerDependencies, optionalDependencies), `requirements.txt`, `pyproject.toml` (`[project]`, optional groups, Poetry tables) and `composer.json` (require, require-dev, without `php` and `ext-*`).
- **Pane:** header with the title, the package count and `↻ check` (only with a `package.json`). Every group is one folded line (`▸ package.json · devDependencies  24  ● 3`: count, outdated count). A click unfolds it to one row per package with its declared range.
- **Check outdated:** `↻ check` runs `npm outdated --json`. One status line shows the result, e.g. `● 5 outdated (2 major) · checked 3 min ago`. Rows of outdated packages carry a badge with the latest version: `✗` major behind (below 1.0 also a minor), `●` minor, `○` patch.
- **Copy:** `⧉` on an outdated row copies `npm i <name>@latest`. The mod never runs `npm install`.
- **Project change:** the files are loaded at session start and by `/deps`. When the project root changed, the old check result is dropped. If nothing is loaded, the pane offers `↻ reload`.
- **Commands:** `/deps` reads the files and opens the pane.

Installation: `claude plugin install dependency-pane@desktop-claude-code-mods`, details in `../../README.md`.

Limits: reading the files starts no program. `npm outdated --json` only runs when the button is pressed. Your own npm then asks the npm registry (or the registry from your `.npmrc`) for the latest versions, which is a network request with your npm settings. The check gives up after 90 seconds. If npm is missing, returns no JSON or reports an error, the pane shows the message. Without `node_modules` the current version is missing (`missing`). Python and PHP packages are only listed, not checked. The TOML reader is deliberately simple and only understands the common notations.
