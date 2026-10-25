# session-summary

A pane with a very short running summary of what happened in this session, written by the cheapest model (Haiku). **This is the one mod that spends model tokens**, a small amount.

- **Pane:** two to five bullet points, at most 12 words each, plus a line with the number of turns covered, the model and the tokens all updates cost together. `↻ update` appears when there are turns the summary does not cover yet, or no summary at all.
- **Updates:** after every answer of the main thread. The model does not see the transcript. It gets the summary so far plus a digest of the new turn (what you asked, which files were written, the first 480 characters of the answer), about 300 input tokens and at most 220 output tokens per update, with low effort. Subagent turns are ignored.
- **Secrets:** everything is redacted for known key patterns before it is sent or kept. It goes through the session's own client and credentials, like any model call of the session.
- **Failure:** a failed call (rate limit, overload, timeout after 30 s) keeps the digests and says so in the pane; `↻ update` tries again, the next turn does too.

## Commands

- `/summary` opens the pane. It also opens by itself at the start of a session.

## Settings

- `model` (default `haiku`): an alias or a model id.
- `auto` (default on): off, and the summary only updates on `↻ update`.

## Limits

- The summary lives for the session; it is not saved across sessions.
- The digest of a turn is short on purpose. Long answers are cut, so detail that only sits at the end of an answer is lost.
- Not yet tried in the desktop app.

Installation: `claude plugin install session-summary@desktop-claude-code-mods`, details in `../../README.md`.
