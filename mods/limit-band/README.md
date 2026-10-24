# limit-band

Band above the prompt for the subscription's usage limit: how much of the 5-hour limit (and the 7-day limit) is used and when it resets. No model tokens.

```
◔ 5h limit 72% · resets in 1 h 23 min (11:23)
```

- **Visible only above a threshold** (default 50%). Below it, without reported limits and after the reset the band stays empty.
- **Colour by level:** from 80% a warning (`◕`), from 95% an error (`⚠`), symbol and colour together.
- **Countdown** moves on every 30 seconds and is read again after every turn. In a narrow window only the fullest limit shows, without the clock time.

Settings (`/config`): `threshold` (threshold in percent, default 50), `sevenDay` (show the 7-day limit, default on).

Installation: `claude plugin install limit-band@desktop-claude-code-mods`, details in `../../README.md`.

Limits: the numbers come from the last API response (`$.session.usage()`). Without a subscription (API key) Claude Code reports no limits, and the band stays off. Other sessions use up the same limit; the band sees that only with its own next response.
