# limit-band

Band above the prompt for the subscription's usage limit: how much of the 5-hour limit (and the 7-day limit) is used and when it resets. No model tokens.

```
◔ 5h 72% · ↻ 1 h 23 min
```

- **5-hour limit always** (while its reset time is known): percent and countdown, first in the row, also below the threshold. Switch: `fiveHour`.
- **Other windows only above a threshold** (default 50%). Without reported limits and after the reset the band stays empty.
- **Colour by level:** from 80% a warning (`◕`), from 95% an error (`⚠`), symbol and colour together.
- **Countdown** moves on every 30 seconds and is read again after every turn. The reset shows as a countdown only, no clock time. Below 44 columns only the fullest limit shows. Long text is cut, the band stays one row.
- **Click:** a limit opens the usage page (claude.ai/settings/usage) in the browser.

Settings (`/config`): `fiveHour` (always show the 5-hour limit, default on), `threshold` (threshold in percent for the other windows, default 50), `sevenDay` (show the 7-day limit, default on).

Installation: `claude plugin install limit-band@desktop-claude-code-mods`, details in `../../README.md`.

Limits: the numbers come from the last API response (`$.session.usage()`). Without a subscription (API key) Claude Code reports no limits, and the band stays off. Other sessions use up the same limit; the band sees that only with its own next response.
