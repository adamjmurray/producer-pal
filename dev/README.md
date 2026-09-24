# Dev

Internal developer documentation for the Producer Pal codebase. For the public
documentation site, see [docs/](../docs/) (published at
[producer-pal.org](https://producer-pal.org)).

A doc too big to read whole is a folder: its `README.md` is the index, and each
part is a file beside it.

## Start here

- [Principles.md](Principles.md) — first principles for tool design. Read before
  changing a tool's inputs, outputs, or failure behavior.
- [architecture/](architecture/README.md) — how the pieces fit together.
- [coding-standards/](coding-standards/README.md) — style guide and Live API
  reference.

## Tools

- [tools/Adding-A-Tool.md](tools/Adding-A-Tool.md) — checklist for a new tool.
- [tools/Tool-Schemas.md](tools/Tool-Schemas.md) — shaping input schemas and
  per-mode param text.
- [tools/object-paths/](tools/object-paths/README.md) — the path grammar every
  tool uses to say where.
- [tools/read-tool-includes/](tools/read-tool-includes/README.md) — what the
  read tools return, and their `include` param.
- [memory-system/](memory-system/README.md) — the LLM-managed memory and the
  `ppal-context` tool.

## Live API

- [live-api/Object-Reuse.md](live-api/Object-Reuse.md) — when a LiveAPI object
  can and can't be reused.
- [live-api/Performance.md](live-api/Performance.md) — what object lifetime
  costs, and how to measure it.
- [live-api/Arrangement-Operations.md](live-api/Arrangement-Operations.md) —
  lengthening, splitting and moving arrangement clips.
- [live-api/Device-Param-Labels.md](live-api/Device-Param-Labels.md) — reading
  units and ranges off device parameters.
- [live-api/specialized-devices/](live-api/specialized-devices/README.md) —
  native devices with their own LOM class.

## Clients

- [clients/chat-ui/](clients/chat-ui/README.md) — the built-in chat web app.
- [clients/REST-API.md](clients/REST-API.md) — plain-HTTP access alongside MCP.
- [clients/Desktop-Extension.md](clients/Desktop-Extension.md) — the Claude
  Desktop bundle.

## Quality

- [quality/Testing.md](quality/Testing.md) — what counts as a test, and how
  tests are organized.
- [quality/Linting.md](quality/Linting.md) — oxlint and oxfmt setup.
- [quality/mutation-testing/](quality/mutation-testing/README.md) — mutation
  testing and per-scope baselines.
- [quality/development-tools/](quality/development-tools/README.md) — CLI tools,
  Live API scripts and test Live Sets.
- [quality/eval-findings/](quality/eval-findings/README.md) — what eval runs
  have shown about model behavior.

## Process

- [process/Releasing.md](process/Releasing.md) — the release steps.
- [process/Documentation-Site.md](process/Documentation-Site.md) — the VitePress
  docs site.

## Reference

- [specs/](specs/README.md) — grammar specs for bar|beat, transforms and Stark.
- [decisions/](decisions/README.md) — ADRs: why settled choices went the way
  they did.
- [plans/](plans/README.md) — improvement plans not on the roadmap.
