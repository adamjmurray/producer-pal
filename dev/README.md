# Dev

Internal developer documentation for the Producer Pal codebase. For the public
documentation site, see [docs/](../docs/) (published at
[producer-pal.org](https://producer-pal.org)).

A doc too big to read whole is a folder: its `README.md` is the index, and each
part is a file beside it.

## Start here

- [PRINCIPLES.md](PRINCIPLES.md) — first principles for tool design. Read before
  changing a tool's inputs, outputs, or failure behavior.
- [architecture/](architecture/README.md) — how the pieces fit together.
- [coding-standards/](coding-standards/README.md) — style guide and Live API
  reference.

## Tools

- [tools/adding-a-tool.md](tools/adding-a-tool.md) — checklist for a new tool.
- [tools/tool-schemas.md](tools/tool-schemas.md) — shaping input schemas and
  per-mode param text.
- [tools/object-paths/](tools/object-paths/README.md) — the path grammar every
  tool uses to say where.
- [tools/read-tool-includes/](tools/read-tool-includes/README.md) — what the
  read tools return, and their `include` param.
- [tools/memory-system/](tools/memory-system/README.md) — the LLM-managed memory
  and the `ppal-context` tool.

## Live API

- [live-api/object-reuse.md](live-api/object-reuse.md) — when a LiveAPI object
  can and can't be reused.
- [live-api/performance.md](live-api/performance.md) — what object lifetime
  costs, and how to measure it.
- [live-api/arrangement-operations.md](live-api/arrangement-operations.md) —
  lengthening, splitting and moving arrangement clips.
- [live-api/device-param-labels.md](live-api/device-param-labels.md) — reading
  units and ranges off device parameters.
- [live-api/specialized-devices/](live-api/specialized-devices/README.md) —
  native devices with their own LOM class.

## Clients

- [clients/chat-ui/](clients/chat-ui/README.md) — the built-in chat web app.
- [clients/rest-api.md](clients/rest-api.md) — plain-HTTP access alongside MCP.
- [clients/desktop-extension.md](clients/desktop-extension.md) — the Claude
  Desktop bundle.

## Quality

- [quality/testing.md](quality/testing.md) — what counts as a test, and how
  tests are organized.
- [quality/linting.md](quality/linting.md) — oxlint and oxfmt setup.
- [quality/mutation-testing/](quality/mutation-testing/README.md) — mutation
  testing and per-scope baselines.
- [quality/development-tools/](quality/development-tools/README.md) — CLI tools,
  Live API scripts and test Live Sets.
- [quality/eval-findings/](quality/eval-findings/README.md) — what eval runs
  have shown about model behavior.

## Process

- [process/releasing.md](process/releasing.md) — the release steps.
- [process/documentation-site.md](process/documentation-site.md) — the VitePress
  docs site.

## Reference

- [specs/](specs/README.md) — grammar specs for bar|beat, transforms and Stark.
- [decisions/](decisions/README.md) — ADRs: why settled choices went the way
  they did.
- [plans/](plans/README.md) — improvement plans not on the roadmap.
