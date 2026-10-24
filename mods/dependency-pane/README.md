# dependency-pane

A pane with the project's dependencies and their declared version ranges. No model tokens.

- **Sources** in the project folder: `package.json` (dependencies, devDependencies, peerDependencies, optionalDependencies), `requirements.txt`, `pyproject.toml` (`[project]`, optional groups, Poetry tables) and `composer.json` (require, require-dev, without `php` and `ext-*`). One group per section, folded and unfolded with a click, packages sorted by name.
- **Check outdated:** the button (only with a `package.json`) runs `npm outdated --json` and shows the current, wanted and latest version per package. Red `✗` is a major version behind (below 1.0 also a minor version), yellow `●` a minor version, `○` only a patch. In the group, the latest version stands next to the package.
- **Reload** reads the files again.
- **Commands:** `/deps` reads the files and opens the pane.

Installation: `claude plugin install dependency-pane@desktop-claude-code-mods`, details in `../../README.md`.

Limits: reading the files starts no program. `npm outdated --json` only runs when the button is pressed. Your own npm then asks the npm registry (or the registry from your `.npmrc`) for the latest versions, which is a network request with your npm settings. The check gives up after 90 seconds. If npm is missing, returns no JSON or reports an error, the pane shows the message. Without `node_modules` the current version is missing (`missing`). Python and PHP packages are only listed, not checked. The TOML reader is deliberately simple and only understands the common notations.
