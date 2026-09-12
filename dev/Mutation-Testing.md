# Mutation Testing

Mutation testing validates **test efficacy**, not just coverage. The suite
already enforces 99%+ line/statement and 100% function coverage — but coverage
measures _execution_, not _fault detection_. A test can run a line and assert
nothing. Mutation testing closes that gap: it introduces small faults
("mutants") into the source and checks whether the suite fails. A **surviving
mutant** is a behavior change no test caught — a concrete test-quality gap.

Tool: [Stryker Mutator](https://stryker-mutator.io/) with the Vitest runner. The
full CI-rollout plan (scheduled matrix, incremental PR checks, priority areas)
is tracked as project work; the matrix sketch is inlined under "Status & next
steps" below.

## Running

```bash
npm run mutation                 # default scope: notation
npm run mutation -- clip         # one src/tools/ domain
npm run mutation -- sharedRuntime # src/shared (cross-cutting utilities)
npm run mutation -- mcpServer    # src/mcp-server (Node-for-Max server)
npm run mutation -- tools        # every tool domain (group)
npm run mutation -- notation clip
npm run mutation -- all          # notation + sharedRuntime + mcpServer + every tool domain
```

Mutation testing is **scoped** and deliberately **not** part of `npm run check`
— a full pass takes minutes, too slow for the per-PR hot path. Whole-tree runs
are hours, so we mutate one area ("scope") at a time.

Scopes are defined in `config/mutation-scopes.mjs`:

- **`notation`** — `src/notation/` (the default). Ratcheted: `break: 86`.
- **One scope per `src/tools/` domain** — `actions`, `advanced`, `clip`, `core`,
  `device`, `live-set`, `scene`, `session`, `shared`, `track`. Each excludes
  tests, test helpers, `.def.ts` tool-definition files, `*-disabled.ts`
  build-time substitution stubs, and type-only modules (see `toolDomain()`). A
  domain starts in **baseline mode** (`break: null`, measure-only) until its
  survivors are triaged in its own PR and it earns a floor in
  `TOOL_DOMAIN_BREAKS`. All ten are now triaged: `track` (`break: 85`),
  `session` (`break: 89`), `actions` (`break: 90`), `device` (`break: 90`),
  `clip` (`break: 96`), `advanced` (`break: 97`), `core` (`break: 99`), `scene`
  (`break: 96`), `live-set` (`break: 98`), `shared` (`break: 94`).
- **`sharedRuntime`** — `src/shared/` (cross-cutting utilities shared by the
  Node MCP server and the V8 Max runtime: pitch, notation identity, compact
  serializer/parser, path builders, config, error/response utils, v8 console /
  sleep, silent-wav, version-check). It is **not** under `src/tools/`, so it
  uses its own glob const (`SHARED_RUNTIME_GLOBS`), and its scope key can't be
  `shared` — that already means `src/tools/shared`. Triaged: `break: 94`.
- **`mcpServer`** — `src/mcp-server/` (the Node-for-Max side: the Express app,
  MCP server wiring, REST routes, the live-library SQLite reader, the
  markdown/memory/skill override stores, and the RPC protocol to the V8
  runtime). Also **not** under `src/tools/`, so it uses its own glob const
  (`MCP_SERVER_GLOBS`) and the camelCase key `mcpServer`. The bundle entry point
  `mcp-server.ts` is excluded (it runs module-load side effects wired to
  `max-api` and is already coverage-excluded). Triaged: `break: 87`.
- **Groups** — `tools` (all ten tool domains) and `all` (notation +
  `sharedRuntime` + `mcpServer` + tools), expanded by the runner into their
  member scopes.

Mechanics:

- Runner: `config/run-mutation.mjs` — resolves the requested scopes/groups,
  rebuilds the peggy parsers, then runs Stryker once per scope with
  `MUTATION_SCOPE` set, aggregating exit codes (non-zero if any gate fires).
- Config: `config/stryker.config.mjs` — reads `MUTATION_SCOPE` (default
  `notation`) and pulls that scope's `mutate` globs and `break` gate from the
  scope table.
- HTML report + incremental cache are **per scope** and gitignored:
  `reports/mutation/<scope>.html` and
  `reports/mutation/<scope>-incremental.json`. Per-scope incremental files mean
  running one scope no longer clobbers another's cache. Open the HTML report to
  browse survivors per file with the exact source diff of each mutant.

The config reuses the project `vitest.config.ts`, so path aliases (`#src` etc.),
the test environment, and env flags all apply unchanged.
`coverageAnalysis: "perTest"` means each mutant only re-runs the tests that
cover it, not the whole ~8k-test suite — this is the main reason a run is
minutes, not hours.

### Adding a new scope

Add an entry to `SCOPES` in `config/mutation-scopes.mjs` (`mutate` globs +
`break: null` for baseline mode); tool domains can use the `toolDomain()`
helper. Optionally add it to a group. That's it — the config and runner pick it
up by name.

## Baselines

Per-scope results live in [mutation-baselines/](mutation-baselines/) — one file
each, with the score table, the lowest-scoring files, documented equivalents,
and a "Gaps closed" log. Read only the one you're working on.

| Scope                                      | Break             | Baseline                                                  |
| ------------------------------------------ | ----------------- | --------------------------------------------------------- |
| `notation`                                 | 86                | [notation.md](mutation-baselines/notation.md)             |
| `track`                                    | 85                | [track.md](mutation-baselines/track.md)                   |
| `session`                                  | 89                | [session.md](mutation-baselines/session.md)               |
| `actions`                                  | 90                | [actions.md](mutation-baselines/actions.md)               |
| `device`                                   | 90                | [device.md](mutation-baselines/device.md)                 |
| `clip`                                     | 96                | [clip.md](mutation-baselines/clip.md)                     |
| `advanced` / `core` / `scene` / `live-set` | 97 / 99 / 96 / 98 | [read-op-tier.md](mutation-baselines/read-op-tier.md)     |
| `shared` (`src/tools/shared/`)             | 94                | [shared.md](mutation-baselines/shared.md)                 |
| `sharedRuntime` (`src/shared/`)            | 94                | [shared-runtime.md](mutation-baselines/shared-runtime.md) |
| `mcpServer`                                | 87                | [mcp-server.md](mutation-baselines/mcp-server.md)         |
| `v8Adapter`                                | 97                | [v8-adapter.md](mutation-baselines/v8-adapter.md)         |

The `break` gate is **ratcheted**: a run fails (exit 1) below the floor. Raise
it as a score climbs; never lower it without triaging the regression. The floors
live in `config/mutation-scopes.mjs`.

## Interpreting survivors

Each survivor falls into one of three buckets — triage before acting:

1. **Real test gap** — the mutated behavior matters but nothing asserts on it.
   Add/strengthen an assertion. This is the payoff.
2. **Equivalent mutant** — the mutation produces behavior indistinguishable from
   the original (e.g. `<=` vs `<` on a bound that's never hit, reordering
   commutative ops). Not fixable; ignore. Stryker can't detect these
   automatically.
3. **Weak-but-acceptable** — defensive code, log strings, or output formatting
   where an assertion would be over-fitting. Judgement call.

`# no coverage` mutants are lines no test exercises at all — usually the easiest
wins, and a cross-check against the line-coverage gate.

### Verifying a survivor

Bucket 1 and bucket 2 look identical in the report, and guessing wrong wastes a
lot of time — either writing tests for an equivalent mutant, or dismissing a
real gap as "probably equivalent". Decide it empirically instead:

1. Read the mutant's exact node out of
   `reports/mutation/<scope>-incremental.json` — `location` (1-based
   line/column, inclusive start, exclusive end) plus `replacement`. Use the
   embedded `source` to print `line.slice(startCol - 1, endCol - 1)` and confirm
   what you're replacing. Stryker mutates _sub-expressions_: a
   `ConditionalExpression` on `if (a && b)` usually targets just `a`, and
   hand-mutating the whole condition will mislead you.
2. Apply it to the file, run the covering test suite, restore the file. A
   non-zero exit means a killing test already exists (a `perTest` attribution
   artifact — unkillable via more tests, so document it). Exit zero means it is
   genuinely uncaught: a real gap _or_ an equivalent, which you then reason
   about normally.

Scripting this over every Survived/NoCoverage mutant in a scope takes a couple
of minutes and turns triage into a worklist. Re-running it per-file after each
edit is also a much faster confirm loop than a full Stryker pass. Two cautions:
the verdict is binary (an uncaught equivalent still reads "uncaught"), and a
test can kill a mutant for the wrong reason — so read the surviving code, don't
just chase green.

## Status & next steps

**The whole source tree is now triaged and ratcheted — no scope is left in
baseline mode, and none remains unmutated.** The ten tool domains: the write-op
tier `track` (`break: 85`), `session` (`break: 89`), `actions` (`break: 90`),
`device` (`break: 90`), `clip` (`break: 96`); the read-op / small tier
`advanced` (`break: 97`), `core` (`break: 99`), `scene` (`break: 96`),
`live-set` (`break: 98`); and `shared` (`break: 94`). Plus the four
non-`src/tools/` scopes: `notation` (`break: 86`), `sharedRuntime`
(`src/shared/`, `break: 94`), `mcpServer` (`src/mcp-server/`, `break: 87`) and
`v8Adapter` (`src/live-api-adapter/`, `break: 97`). The per-domain scope
mechanism (`config/mutation-scopes.mjs` + the runner) is in place, so each area
can be mutated on its own. Mutation testing stays off the per-PR hot path (a
full pass is minutes). Remaining work (later releases):

- Keep triaging the ~588 notation survivors, but expect diminishing returns: the
  dense clusters left are epsilon-boundary / warning-string / equivalent mutants
  (bucket 2/3), so genuine bucket-1 gaps are now sparse.
- Raise each scope's `break` as its score climbs.
- Optionally wire a scheduled (nightly/weekly) non-blocking CI job once several
  domains have floors — full-tree runtime is hours, not minutes.

### CI-rollout sketch

A full-tree run is ~8–20 hours, so it can't be per-commit — but GitHub Actions
is free for public repos with a 6-hour hard cap per job. Split the tree into
module groups running as parallel matrix jobs, each in its own 6-hour window
(the slowest module is likely 2–3 hours, well under the cap):

```yaml
on:
  schedule:
    - cron: "0 3 * * 1" # Weekly Monday 3am UTC
jobs:
  mutation-test:
    strategy:
      fail-fast: false
      matrix:
        scope: [notation, clip, device, track, actions, session, shared]
    steps:
      - run: npm run mutation -- ${{ matrix.scope }}
      # Upload reports/mutation/<scope>.html as an artifact
```

Each matrix job runs one scope from `config/mutation-scopes.mjs`, so the matrix
is just a list of scope names — no duplicated glob strings to keep in sync.

After the first full run, `--incremental` mode only re-tests mutants in changed
files, bringing per-PR runs down to minutes — viable as a non-blocking check.

**Priority areas when widening** (high-risk first):

1. **Write operations** (`update-*`, `create-*`, `delete`) — weak assertions
   here could mask bugs that modify Live Sets.
2. **Recently migrated test files** — the 83 files touched in the mock registry
   migration are most likely to have weakened assertions.
3. **Arrangement operations** — complex edge cases around clip splitting,
   tiling, and boundary detection.
