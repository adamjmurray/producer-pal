# Mutation baseline — 2026-07-15, `mcpServer` — `src/mcp-server/`

The Node-for-Max server layer (58 mutated files) — the Express app, MCP server
wiring, REST routes, the live-library SQLite reader, the markdown/memory/skill
override stores, and the RPC protocol to the V8 runtime. Full pass — Stryker
9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric    | Baseline | Triaged    | Gate (`break`) |
| --------- | -------- | ---------- | -------------- |
| mcpServer | 88.14%   | **88.51%** | 87             |

The raw all-files run scores 86.31%, but the bundle entry point `mcp-server.ts`
(0% covered, 57 all-NoCoverage mutants) is **excluded** from the scope:
importing it runs module-load side effects wired to `max-api` (registers Node
routes, binds `.listen()`), so it's e2e-territory and is already
coverage-excluded in `vitest.config.ts` — the same rationale `toolDomain()` uses
for `.def.ts` / `*-disabled.ts`. Excluding it puts the honest baseline at
88.14%; the triage below lifts it to 88.51%, all test-only.

This is the most infrastructure-heavy domain triaged so far, so the clean-gap
ceiling is low and the surviving mutants are dominated by bucket 2/3 categories
rather than real gaps:

- **Device-notification side effects.** `create-express-app.ts` alone holds 60
  survivors, almost all `Max.outlet("config", <key>, <value>)` emissions and the
  `outlets.push(() => …)` arrows that batch them. Tests assert the resulting
  config **state**, not that each notification fires with an exact channel/key
  string — asserting those would over-fit the device-sync protocol.
- **Dynamic SQL builders.** The live-library query files (`candidate-query`,
  `find-similar`, `find-duplicates`, `library-search`) build `WHERE` clauses and
  `?`-placeholder lists by string concatenation; the
  `where.length > 0 ? "WHERE " + … : ""` conditionals and placeholder joins
  survive because the tests assert query **results** against a fixture DB, not
  the exact SQL text.
- **The `perTest` guard-attribution quirk** (also seen in `sharedRuntime`).
  Stryker does not attribute a test to an `if`-guard mutant when that test
  early-returns at the guard, so several guards whose behavior _is_ directly
  unit-tested stay unkillable — confirmed via `coveredBy`:
  `resolveClipSubtype`'s `fileType !== ALC || subtype == null` guard
  (library-filters L141) lists only the `librarySearch` integration tests, not
  the direct `resolveClipSubtype(wav, alcM) === null` unit test that would kill
  it; likewise `resolveAbsolutePaths([])` (reconstruct-path L73) and
  `clampLibraryLimit`'s null/`≤0` guard.
- **`readdir`-order-equivalent sorts.** The store `sortByName`
  (`entries.sort((a,b) => a.name.localeCompare(b.name))`, memory-store L123 +
  custom-skills L133) is a no-op on the test platform because macOS APFS
  `readdirSync` already returns lexicographic order, and all slugs are
  lowercase-ascii (byte order == locale order). The sort is cross-platform
  defensive; killing it would require forging an unsorted `readdir`, i.e.
  over-fitting to filesystem order.
- **Static regex module-init, log/header strings, `finally`/`catch`
  block-empties.** `WINDOWS_DRIVE_ROOT` / `Live-files-(\d+)` regexes (0-coverage
  static initializers, a known Stryker limitation),
  `console.info`/`warn`/`error` message literals,
  `res.set("Cache-Control", "no-store")` header strings, and `} finally { … }`
  cleanup blocks whose emptying is behaviorally invisible.
- **Genuine equivalents.** `writeSkillOverride(name, "")` ≡ deleting the slot
  (an empty-body override file is dropped on read, so both yield
  `override: ""`); the `> 0` / `>= 0` length guards on already-non-empty
  collections.

## Gaps closed (`mcpServer`)

| Gap (now killed)                                                                | Test added / strengthened     |
| ------------------------------------------------------------------------------- | ----------------------------- |
| `requireString`/`optionalString` null-args `?.[key]` guard + field-named errors | `route-args.test.ts` (new)    |
| `clampLibraryLimit` non-positive request → default (the `<= 0` branch)          | `library-filters.test.ts`     |
| `parseFrontmatter` body: anchored `^\n` strip preserves interior newlines       | `frontmatter.test.ts`         |
| `cosineSimilarity` bounded by the shorter vector (no read past the end)         | `fe-values-helpers.test.ts`   |
| `rejectCrossOriginWrite`: foreign origin → 403 + returns `true`                 | `request-origin.test.ts`      |
| `resolveAbsolutePaths`: 3-segment path sets `folder` (the `>= 3` boundary)      | `reconstruct-path.test.ts`    |
| Custom-skills index emits no `## Disabled` section when all skills are enabled  | `custom-skills-store.test.ts` |
