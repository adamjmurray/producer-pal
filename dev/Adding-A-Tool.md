# Adding a Tool

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

6. **Document it** in [docs/features.md](../docs/features.md) — a hand-written
   section plus the generated schema partial (`npm run docs:schemas`). The tool
   count in the page's frontmatter description is hand-written too.

Then `npm run fix && npm run check`. The tests that hold steps 4 and 5 are
[tool-groups-catalog.test.ts](../src/shared/tests/tool-groups-catalog.test.ts)
and
[fragment-tool-gates.test.ts](../src/skills/tests/fragment-tool-gates.test.ts).
