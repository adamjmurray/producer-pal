`--format json` returns standard JSON instead of the token-optimized compact
form, and `midi-json` represents notes as a JSON array the agent can generate
and read directly.

For a **normal music-making conversation**, keep the defaults (compact output,
bar|beat notation) — they use fewer tokens and the agent reads them fine.

Both are global device settings, so they also change what the chat UI and any
other connected clients see.
