`--tools` keeps only what you list; `--disable-tools` drops what you list. Both
take tool names (`read-clip` or `ppal-read-clip`) and group names: `core`,
`session`, `actions`, `live-set`, `track`, `scene`, `clip`, `device`,
`advanced`, and `read-only`. Run `npx producer-pal --list-tools` to print the
groups plus the tools the running device currently offers.

Withholding a tool also drops the part of the
[Producer Pal Skills](/features#skills) that teaches it, so you stop paying for
the tool's schema _and_ its guidance in every conversation. `--tools read-only`
cuts the skills text by more than half.

Unlike the other flags, this one is per client: the [Chat UI](/guide/chat-ui)
and your other MCP clients keep the full toolset. `ppal-connect` is always kept
— it is how the AI connects and receives the skills.

One wrinkle with `--tools`: it is resolved against the tool list this copy of
`npx producer-pal` knows, so a tool added in a newer Producer Pal stays enabled
until you update. `--disable-tools` names tools directly and has no such gap.
