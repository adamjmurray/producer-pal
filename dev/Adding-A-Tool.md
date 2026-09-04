# Adding a Tool

First: should this be a tool at all? Principles (Efficiency) says to cover the
Live API with as few tools as possible, so a thing reachable through an existing
tool's params belongs there instead. Device parameters are the worked example —
they're a property of `update-device`'s target, not a tool of their own.

A new MCP tool touches a handful of places. Most of them fail a test if you skip
them — this list is so you don't discover that one at a time.

1. **Write the tool.** `src/tools/<area>/<name>.def.ts` (schema + description)
   and `<name>.ts` (the handler) beside it, plus `tests/`. See
   [Tool-Schemas.md](Tool-Schemas.md) for param shapes and per-mode
   descriptions. Set `annotations.readOnlyHint: true` if it changes nothing in
   Live's undo history.

2. **Register the def** in `STANDARD_TOOL_DEFS`
   ([create-mcp-server.ts](../src/mcp-server/create-mcp-server.ts)). This is the
   MCP side: schema, description, tool listing.

3. **Register the handler** in the `tools` dispatch map
   ([live-api-adapter.ts](../src/live-api-adapter/live-api-adapter.ts)). This is
   the V8 side. Two registrations, not one, because the two run in different
   bundles — the V8 runtime must not pull in zod.

4. **Put it in a group** in `TOOL_GROUPS`
   ([tool-groups.ts](../src/shared/tool-groups.ts)), and in `READ_ONLY_TOOLS` if
   it declares `readOnlyHint`. This is what the Tools tab lists and what the
   portal's `--tools` / `--disable-tools` resolve against.

5. **Decide its skills gates** in `FRAGMENT_GATES`
   ([fragment-tool-gates.ts](../src/skills/fragment-tool-gates.ts)): add it to
   every fragment it can act on, or list it in the test's `TEACHES_NO_FRAGMENT`
   with why. The table is keyed by fragment, so a new tool is gated by nothing
   until you say otherwise — the decision is forced, but the answer is yours.
   Getting it wrong means guidance silently missing for a toolset where your
   tool is the only one keeping that fragment alive.

6. **Document it** in [docs/features/tools.md](../docs/features/tools.md) — a
   hand-written section plus two generated partials: the schema table
   (`npm run docs:schemas`) and an example call (`npm run docs:examples`). The
   tool count in the page's frontmatter description is hand-written too.

7. **Add an example call** to `TOOL_EXAMPLES`
   ([example-live-set/calls.ts](../scripts/build-and-release/tool-reference/example-live-set/calls.ts)),
   which runs against the mock Live Set in that directory. Every tool needs one.
   If the fixture has nothing your tool can act on, add it there too.

Then `npm run fix && npm run check`. The tests that hold steps 4, 5, and 7 are
[tool-groups-catalog.test.ts](../src/shared/tests/tool-groups-catalog.test.ts),
[fragment-tool-gates.test.ts](../src/skills/tests/fragment-tool-gates.test.ts),
and
[tool-output-doc-partials.test.ts](../scripts/build-and-release/tool-reference/tool-output-doc-partials.test.ts).
