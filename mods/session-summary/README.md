# session-summary

A pane with a very short running summary of what happened in this session, written by the cheapest model (Haiku). **This is the one mod that spends model tokens**, a small amount.

- **Pane:** two to five bullet points, at most 12 words each, plus a line with the number of turns covered, the model and the tokens all updates cost together. `↻ update` appears when there are turns the summary does not cover yet, or no summary at all.
- **Language:** the button with the language name in the pane's head (`English`, `German`, `French`, ...) goes on to the next language, the choice is kept across sessions, and the summary that already exists is written again in the new language (one tiny call, a few dozen tokens). Without a choice the setting `language` applies. A language is only a name: letters, spaces, hyphens and parentheses, at most 30 characters, so it cannot carry an instruction.
- **Switch:** `● auto` / `○ auto off` in the pane's head turns the automatic updates on and off, and the choice is kept across sessions. Off, nothing is sent to the model; turns are still noted, so `↻ update` (or switching on again) catches up. Without a choice, the setting `auto` applies.
- **Updates (kept cheap):** only while the pane is open, in batches. The first summary comes right after the first real turn; after that a call waits for three new turns or a quiet minute and a half. A closed pane costs nothing, and opening it sends everything that waited in one call. Turns with no file written and a short answer ("ok", "yes, port 3000") are skipped. A call sends the summary so far plus a digest per new turn (your question cut to 160 characters, the files written, the answer cut to 240, or to 120 when files were written), at most 120 output tokens, 2 to 4 bullets of at most 10 words, low effort. Subagent turns are ignored. `↻ update` sends whatever waits, any time.
- **Secrets:** everything is redacted for known key patterns before it is sent or kept. It goes through the session's own client and credentials, like any model call of the session.
- **Prompt hygiene:** each digest goes to the model inside `<turn>…</turn>` and the summary so far inside `<summary>…</summary>`, with `<` and `>` removed from the text. The system prompt says that text inside the tags is data.
- **Failure:** a failed call (rate limit, overload, timeout after 30 s) keeps the digests and says so in the pane; `↻ update` tries again, the next turn does too. A permanent error (`invalid_request`, `authentication_failed`, `model_not_found`, for example a wrong `model` setting) pauses the automatic calls for the session: the note says "Check the model setting; auto paused for this session." `↻ update`, or switching auto off and on, lifts the pause.

## Commands

- `/summary` opens the pane. It also opens by itself at the start of a session, but only while auto is on.

## Settings

- `model` (default `haiku`): an alias or a model id.
- `language` (default `English`): the language the summary is written in, any name such as `German` or `Deutsch`. The start value of the button in the pane; a choice made there wins.
- `auto` (default on): the start value of the switch in the pane. A choice made in the pane wins.

## Limits

- The summary lives for the session; it is not saved across sessions.
- The digest of a turn is short on purpose. Long answers are cut, so detail that only sits at the end of an answer is lost.
- Not yet tried in the desktop app.

Installation: `claude plugin install session-summary@desktop-claude-code-mods`, details in `../../README.md`.
