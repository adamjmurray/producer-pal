# Mutation baseline — 2026-07-15, `mcpServer` — `src/mcp-server/`

The Node-for-Max server layer (58 mutated files): the Express app, MCP server
wiring, REST routes, the live-library SQLite reader, the markdown/memory/skill
override stores, and the RPC protocol to the V8 runtime. Full pass — Stryker
9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric    | Baseline | Triaged    | Gate (`break`) |
| --------- | -------- | ---------- | -------------- |
| mcpServer | 88.14%   | **88.51%** | 87             |

The raw all-files run scores 86.31%, but the bundle entry point `mcp-server.ts`
(0% covered, 57 all-NoCoverage mutants) is **excluded**: importing it runs
module-load side effects wired to `max-api` (registers Node routes, binds
`.listen()`), so it's e2e territory and already coverage-excluded in
`vitest.config.ts`, the same rationale `toolDomain()` uses for `.def.ts` /
`*-disabled.ts`. Excluding it gives the 88.14% baseline; triage (test-only)
lifted it to 88.51%.

This is the most infrastructure-heavy domain, so the clean-gap ceiling is low
and the survivors are mostly bucket 2/3:

- **Device-notification side effects.** `create-express-app.ts` alone holds 60
  survivors, almost all `Max.outlet("config", <key>, <value>)` emissions and the
  `outlets.push(() => …)` arrows that batch them. Tests assert the resulting
  config **state**, not each notification's exact channel/key string; asserting
  those would over-fit the device-sync protocol.
- **Dynamic SQL builders.** The live-library query files (`candidate-query`,
  `find-similar`, `find-duplicates`, `library-search`) build `WHERE` clauses and
  `?`-placeholder lists by string concatenation. The `WHERE` conditionals and
  placeholder joins survive because tests assert query **results** against a
  fixture DB, not the SQL text.
- **The `perTest` guard-attribution quirk** (also seen in `sharedRuntime`).
  Stryker doesn't attribute a test to an `if`-guard mutant when that test
  early-returns at the guard, so guards whose behavior _is_ directly unit-tested
  stay unkillable (confirmed via `coveredBy`): `resolveClipSubtype`'s
  `fileType !== ALC || subtype == null` guard lists only the `librarySearch`
  integration tests, not the direct unit test that would kill it; likewise
  `resolveAbsolutePaths([])` and `clampLibraryLimit`'s null/`≤0` guard.
- **`readdir`-order-equivalent sorts.** The store `sortByName`
  (`entries.sort((a,b) => a.name.localeCompare(b.name))`, in the memory and
  custom-skills stores) is a no-op on the test platform: macOS APFS
  `readdirSync` already returns lexicographic order, and slugs are lowercase
  ASCII. The sort is cross-platform defensive; killing it would mean forging an
  unsorted `readdir`.
- **Static regex module-init, log/header strings, `finally`/`catch`
  block-empties.** `WINDOWS_DRIVE_ROOT` / `Live-files-(\d+)` regexes (0-coverage
  static initializers, a known Stryker limitation),
  `console.info`/`warn`/`error` literals,
  `res.set("Cache-Control", "no-store")`, and `} finally { … }` cleanup blocks
  whose emptying is behaviorally invisible.
- **Genuine equivalents.** `writeSkillOverride(name, "")` ≡ deleting the slot
  (an empty-body override file is dropped on read, so both yield
  `override: ""`); `> 0` / `>= 0` length guards on already-non-empty
  collections.

What changed (test-only): `requireString`/`optionalString` null-args guard and
field-named errors (`route-string-args.test.ts`, new); `clampLibraryLimit`
non-positive request → default; `parseFrontmatter` anchored `^\n` strip
preserves interior newlines; `rejectCrossOriginWrite` foreign origin → 403;
`resolveAbsolutePaths` 3-segment path sets `folder` (the `>= 3` boundary); the
custom-skills index emits no `## Disabled` section when all skills are enabled.
The vector-distance helper (then `cosineSimilarity`, now `euclideanDistance` in
`feature-vectors.ts`) is bounded by the shorter vector so it never reads past
the end.
