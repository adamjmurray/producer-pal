# Mutation Testing

Mutation testing validates **test efficacy**, not just coverage. The suite
already enforces 99%+ line/statement and 100% function coverage — but coverage
measures _execution_, not _fault detection_. A test can run a line and assert
nothing. Mutation testing closes that gap: it introduces small faults
("mutants") into the source and checks whether the suite fails. A **surviving
mutant** is a behavior change no test caught — a concrete test-quality gap.

Tool: [Stryker Mutator](https://stryker-mutator.io/) with the Vitest runner. CI
runs it weekly and on manual dispatch
(`.github/workflows/mutation-testing.yml`); see "Scheduled CI run" below.

## Running

```bash
npm run mutation                 # default scope: notation
npm run mutation -- clip         # one src/tools/ domain
npm run mutation -- sharedRuntime # src/shared (cross-cutting utilities)
npm run mutation -- mcpServer    # src/mcp-server (Node-for-Max server)
npm run mutation -- tools        # every tool domain (group)
npm run mutation -- notation clip
npm run mutation -- all          # every scope
```

Mutation testing is **scoped** and deliberately **not** part of `npm run check`
— a full pass takes minutes, too slow for the per-PR hot path. Whole-tree runs
are hours, so we mutate one area ("scope") at a time.

Scopes are defined in `config/mutation-scopes.mjs`, which also holds each
scope's `break` floor (the table under "Baselines" mirrors them):

- **`notation`** — `src/notation/` (the default).
- **One scope per `src/tools/` domain** — `actions`, `advanced`, `clip`, `core`,
  `device`, `live-set`, `scene`, `session`, `shared`, `track`. Each excludes
  tests, test helpers, `.def.ts` tool-definition files, `*-disabled.ts`
  build-time substitution stubs, and type-only modules (see `toolDomain()`). A
  domain starts in **baseline mode** (`break: null`, measure-only) until its
  survivors are triaged in its own PR and it earns a floor in
  `TOOL_DOMAIN_BREAKS`.
- **`sharedRuntime`** — `src/shared/` (cross-cutting utilities shared by the
  Node MCP server and the V8 Max runtime: pitch, notation identity, compact
  serializer/parser, path builders, config, error/response utils, v8 console /
  sleep, version-check). It is **not** under `src/tools/`, so it uses its own
  glob const (`SHARED_RUNTIME_GLOBS`), and its scope key can't be `shared` —
  that already means `src/tools/shared`.
- **`mcpServer`** — `src/mcp-server/` (the Node-for-Max side: the Express app,
  MCP server wiring, REST routes, the live-library SQLite reader, the
  markdown/memory/skill override stores, the silent-WAV generator, and the RPC
  protocol to the V8 runtime). Also **not** under `src/tools/`, so it uses its
  own glob const (`MCP_SERVER_GLOBS`) and the camelCase key `mcpServer`. The
  bundle entry point `mcp-server.ts` is excluded (it runs module-load side
  effects wired to `max-api` and is already coverage-excluded).
- **`v8Adapter`** — `src/live-api-adapter/` (the V8 side of the Max device).
- **Groups** — `tools` (all ten tool domains) and `all` (every scope above),
  expanded by the runner into their member scopes.

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

Per-scope results live in [baselines/](baselines/) — one file each, with the
score table, the lowest-scoring files, documented equivalents, what the triage
changed, and the lessons that still apply. They are dated records: file and
function names are as of the baseline, and code has moved since. Read only the
one you're working on.

| Scope                                      | Break             | Baseline                                         |
| ------------------------------------------ | ----------------- | ------------------------------------------------ |
| `notation`                                 | 86                | [notation.md](baselines/notation.md)             |
| `track`                                    | 85                | [track.md](baselines/track.md)                   |
| `session`                                  | 89                | [session.md](baselines/session.md)               |
| `actions`                                  | 90                | [actions.md](baselines/actions.md)               |
| `device`                                   | 90                | [device.md](baselines/device.md)                 |
| `clip`                                     | 96                | [clip.md](baselines/clip.md)                     |
| `advanced` / `core` / `scene` / `live-set` | 97 / 99 / 96 / 98 | [read-op-tier.md](baselines/read-op-tier.md)     |
| `shared` (`src/tools/shared/`)             | 94                | [shared.md](baselines/shared.md)                 |
| `sharedRuntime` (`src/shared/`)            | 94                | [shared-runtime.md](baselines/shared-runtime.md) |
| `mcpServer`                                | 87                | [mcp-server.md](baselines/mcp-server.md)         |
| `v8Adapter`                                | 97                | [v8-adapter.md](baselines/v8-adapter.md)         |

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

## Status

Every scope is triaged and ratcheted; none is in baseline mode. Mutation testing
stays off the per-PR hot path (a full run takes hours).

- Notation's remaining survivors are mostly epsilon-boundary, warning-string and
  equivalent mutants (buckets 2 and 3), so real gaps are sparse.
- Raise a scope's `break` as its score climbs.

### Scheduled CI run

`.github/workflows/mutation-testing.yml` runs every scope weekly (Mondays 03:00
UTC) and on manual dispatch (a scope or group, default `all`). It is not a PR
check and never blocks a commit.

- A first job prints the scope list as JSON
  (`node config/run-mutation.mjs --list all`, from `SCOPE_GROUPS.all`); a matrix
  then runs one scope per job, `fail-fast: false`. A new scope in
  `config/mutation-scopes.mjs` is picked up with no workflow edit.
- A full-tree run is ~8–20 hours and a GitHub Actions job is capped at 6, hence
  one job per scope (`timeout-minutes: 350`).
- Every run is a full one: no incremental file is restored. (To force a full run
  locally, delete `reports/mutation/<scope>-incremental.json`;
  `--incremental false` on the CLI is broken.)
- Each job uploads `reports/mutation/<scope>.html` as the artifact
  `mutation-report-<scope>` (30 days), also when the score is under the floor.
- A scope under its `break` floor fails its own job (Stryker's exit code passes
  through the runner). **Shared runners are noisier than a dev machine.**
  Stryker counts a timeout as killed, and which mutants time out varies per run,
  so a scope near its floor can fail without a real regression. Re-run it and
  read the report before acting. The `v8Adapter` and `mcpServer` scopes are the
  noisiest.
