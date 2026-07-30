# Linting

`npm run lint` runs [oxlint](https://oxc.rs) with `--type-aware`. Configuration
lives in `.oxlintrc.json` (JSONC — it may carry comments, and does).

Formatting is still Prettier; oxfmt is tracked separately.

## Why oxlint

Measured on this repo (1242 files, warm cache, macOS):

| tool                              | wall  | CPU  |
| --------------------------------- | ----- | ---- |
| eslint                            | 31.1s | 183s |
| oxlint, type-aware, same rule set | 5.8s  | 13s  |

About 1s of that is the JS-plugin bridge; native-only it runs in 4.9s.

`npm run check` is run before every push, so this is the single biggest cost in
the loop.

## How the config was produced

```bash
npx @oxlint/migrate eslint.config.js --type-aware --js-plugins --with-nursery
```

That converts 226 of 262 rules and reproduces every override block. The header
comment in `.oxlintrc.json` lists the edits the generator cannot make itself.

## How the config is organized

The generator emitted one override per eslint flat-config block, each spelling
out its complete rule set — 1262 entries over 2303 lines (1304 over 2354 once
the gaps found reviewing it were closed), because eslint's `rules` entries
**replace** rather than merge, so every block had to repeat everything it
wanted. oxlint's overrides **do** merge (top-level first, then each matching
override in array order, later winning per rule), so that repetition buys
nothing.

The blocks are therefore grouped by which trees share a rule. Each rule appears
exactly once, in a block whose `files` is the union of the trees that carried it
— 275 entries over 925 lines, with no rule enabled or disabled anywhere it was
not before. Read a block's `files` as "these trees agree about these rules".

The grouping is mechanical, and was verified as such rather than assumed: for
every file oxlint lints (`oxlint --debug=files`, 1242 of them), the resolved
rule map and `env` came out identical to the config it replaced, and a separate
pass injected violations across every tree and diffed the diagnostics. A clean
`npm run lint` proves nothing here — both configs report zero — so the check has
to be on the resolution, not the outcome.

Two entries were then deliberately dropped, and are the only intended
differences: `eslint-comments/no-unlimited-disable` and the webui
`no-restricted-imports`. Neither ever executed (see below), so removing them
changes what the file claims, not what runs.

To change one tree's rules, move the rule into a block matching only that tree.
Do **not** edit a shared block's `files` — that silently changes every other
tree in it.

Two kinds of block follow the groups: keys-only blocks carrying `env` per tree
(globals are not rules, so they have no group to belong to), then the narrow
exceptions — a rule turned off or retuned for one path, each with its reason.

All 26 type-aware `@typescript-eslint` rules are native, through
`oxlint-tsgolint` (a typescript-go checker, stable since 2026-07). Four plugins
run through oxlint's ESLint-compatible `jsPlugins` bridge, so their packages
remain devDependencies: `eslint-plugin-sonarjs`, `@stylistic/eslint-plugin`,
`@eslint-community/eslint-plugin-eslint-comments`, and `eslint-plugin-unicorn`.

The first three have no native equivalent at all. `unicorn` is different: of the
33 rules the eslint config named, oxlint implements 22 natively, the bridge
supplies 10 (see below), and one was a no-op alias that never enforced anything.
Because `unicorn` is a reserved native plugin name, the bridged copy is aliased
and its rules carry a distinct prefix:

```json
"jsPlugins": [{ "name": "unicorn-js", "specifier": "eslint-plugin-unicorn" }],
"rules": { "unicorn-js/no-duplicate-logical-operands": "error" }
```

**Gotchas:**

- An override that names a rule must also list that rule's plugin in its own
  `plugins`/`jsPlugins` — even when the entry only turns the rule off. Nothing
  accumulates across overrides: declaring the plugin in one block and naming the
  rule in another silently does nothing, with no error. Verified both ways.
- The bridge only sees `eslint-`prefixed suppression directives. oxlint itself
  honors `oxlint-disable` equally, but `eslint-comments/require-description`
  does not fire on it — so **write directives with the `eslint-` prefix**, and
  treat the `oxlint-` spelling as an escape hatch from the description
  requirement.
- **Never put a lint directive on line 1 of a file.** The bridge's line/column
  translation is off by one, so a directive on line 1 computes a negative offset
  and `require-description` dies with
  `RangeError: Line/column pair translates to an out of range offset`. The run
  fails loudly (exit 1), but the stack trace replaces every other JS-plugin
  finding in that file. The SPDX header keeps line 1 occupied everywhere except
  `examples/**`, which is exempt from headers, and `docs/.vitepress/**`, which
  carries none. Reported positions are one line high throughout, not just at the
  boundary.
- Bridged rules get no type information (no `parserServices`), so a rule that
  needs types will silently under-report rather than error. This is why
  `sonarjs/assertions-in-tests` had to be dropped entirely.

## Every file must resolve to a non-empty rule map

Nothing is hoisted: the top-level `rules` is empty and `correctness` is off, so
a tree that appears in no `files` list is linted with **zero rules** and reports
clean — indistinguishable from passing. That blind spot came over from
`eslint.config.js` and went unnoticed until it was measured.

The check, the same one used to verify the regrouping:

```bash
oxlint --debug=files   # every file oxlint lints
```

Resolve each path against the override `files` globs and assert at least one
rule is left enabled. Fourteen files failed it: `e2e/ui/**`,
`docs/.vitepress/**`, `prettier.config.mjs`, and `evals/**/*.mjs`. Every one is
a tree that was created without being added to `eslint.config.js`, reported
clean because of it, and came through the migration unchanged.

They were fixed by adding each tree to the blocks whose rules it already agreed
with — **not** by hoisting the shared set to the top level, which would subject
them to ~192 rules at once, and not by a new block repeating rules that already
live elsewhere. Each landed next to its closest existing sibling:

| tree                            | joins                  | why                                                           |
| ------------------------------- | ---------------------- | ------------------------------------------------------------- |
| `e2e/ui/**/*.ts`                | `e2e/webui/**/*.ts`    | the stubbed Playwright suite next to the live one             |
| `docs/.vitepress/**/*.{ts,vue}` | `e2e/webui/**/*.ts`    | plain TS with no tsconfig, so no type-aware rules             |
| `prettier.config.mjs`           | `config/**/*.{js,mjs}` | a `config/` file living at root only for Prettier's discovery |
| `evals/**/*.mjs`                | `config/**/*.{js,mjs}` | plain Node ESM, not part of the type-checked `evals/**/*.ts`  |

`prettier.config.mjs` sits beside `config/**/*.{js,mjs}` exactly as
`vitest.config.ts` already sits beside `config/**/*.ts`.

`.vue` files are linted through their `<script>` block only; `<template>` and
`<style>` are not covered by any rule here.

Bringing them in cost 17 mechanical fixes (blank lines, one `!!` → `Boolean`)
and two narrow exceptions, both in `.oxlintrc.json` with their reasons:

- `max-lines-per-function` at 630 for `e2e/**/*.spec.ts`. A Playwright
  `test.describe` callback is a suite container, the same thing `**/*.test.*`
  already gets 630 for; Playwright suites are `.spec.ts` so they missed that
  block. Per-**file** `max-lines` still applies at 325.
- `no-restricted-properties` off for `agent-cli-fixture.mjs`, which calls
  `process.cwd()` to record the directory it was spawned in — the subject under
  test, not the path-resolution mistake the rule catches.

Re-run the check when adding a tree. It is deliberately not a meta test: the
answer for a new tree is a decision about which rules it agrees with, not a
default to apply automatically.

## Where oxlint's option defaults differ from eslint's

The generator emits a bare rule name whenever the eslint config passed no
options, which silently adopts oxlint's default for every option — and those do
not always match the eslint rule's. A review of all 56 such entries against the
installed `eslint` and `eslint-plugin-unicorn` sources found four divergences.
Three were weakenings and are now spelled out in `.oxlintrc.json`:

- `no-eval` — oxlint defaults `allowIndirect` to **true**, eslint to false. The
  bare form permits `(0, eval)(x)` and `const g = eval; g(x)`, which is the
  bypass the rule exists to catch.
- `no-irregular-whitespace` — oxlint skips comments, templates, regexes and JSX;
  eslint skips only strings.
- `jsdoc/require-param` — oxlint skips constructors and checks getters/setters;
  eslint-plugin-jsdoc does the reverse.

The fourth is oxlint being stricter and is left alone:
`unicorn/prefer-number-properties` defaults `checkNaN` to true (eslint: false),
so a bare `NaN` is now reported. `checkInfinity` is off in both, so bare
`Infinity` was never enforced despite the old config's comment claiming it.

Everything else matched, including every threshold rule (`max-lines`,
`max-lines-per-function`, `complexity`, `max-depth` all count identically to
eslint) and all 26 type-aware rules.

Two things make this class of error mostly self-limiting: oxlint **hard-fails
the run** on an unknown option key, naming the keys it expected, and the
`jsPlugins` bridge validates against the real plugin's own schema. The one
exception is `import/extensions`, whose options object is a free-form extension
map — unknown keys there are silently dropped.

`restrict-template-expressions`' `{ from: "file" }` allow-entry resolves `path`
against the **TypeScript project root**, which is `src/` here (there is no root
`tsconfig.json`) — not the repo root. The committed eslint spelling
`src/shared/live-api-path-builders.ts` therefore never matched under oxlint;
`shared/live-api-path-builders.ts` does.

## Rules that moved to meta tests

oxlint has no equivalent for arbitrary AST selectors (`no-restricted-syntax`),
the import zone graph (`import-x/no-restricted-paths`), or
`no-restricted-imports`' `patterns[].regex` form. Those were ported to vitest
meta tests, which honor `eslint-disable` and `oxlint-disable` directives so they
are no stricter than the rules they replace:

| was                                     | now                                         |
| --------------------------------------- | ------------------------------------------- |
| `no-restricted-syntax` (webui, LiveAPI) | `src/test/meta/import-restrictions.test.ts` |
| `import-x/no-restricted-paths`          | `src/test/meta/import-restrictions.test.ts` |
| `no-restricted-imports` regex form      | `src/test/meta/import-restrictions.test.ts` |
| `jsdoc/require-jsdoc`                   | `src/test/meta/jsdoc-requirements.test.ts`  |

One of those is not a straight port. The eslint config carried a src-wide ban on
**every** `..` specifier, which never actually ran — the later block adding the
`new LiveAPI()` ban replaced the whole `no-restricted-syntax` entry for
`src/**`, since flat-config `rules` entries replace rather than merge. Reviving
it as written would have been a new rule: `src/` holds 475 parent-relative
specifiers, overwhelmingly files that the file-organization rules pushed down
into `helpers/` or `tests/` reaching back up to their own module root.

What is enforced instead is the boundary the code already respects — **a
relative import must stay inside its own top-level `src/` module**. Measured
across all 475: 473 comply, and the 2 that don't are `src/test/*` reaching the
repo-root `package.json`, which leaves `src/` entirely and is exempt for that
reason. Finer definitions were tried and rejected: keying on the first three
path segments gives 102 violations and the first four gives 263, every one of
them a `helpers/` or `tests/` file reaching its own module root. webui's
identical total ban was never shadowed and is enforced as written.

`eslint-comments/no-unlimited-disable` could not survive the bridge at all, for
a circular reason: a file-wide disable turns off every rule, including the one
that would have reported it, so it never fires no matter the prefix. Its config
entry was removed rather than left claiming enforcement, and
`src/test/lint-suppression-limits.test.ts` is now the sole backstop. Note that
oxlint (unlike ESLint) treats a bare `// oxlint-disable` **line** comment as
file-wide, so the backstop matches that form as well as the block form.

Every check in those tests is verified by injecting a known violation, not just
by passing on a clean tree.

### What the meta tests cost

Moving rules out of lint and into vitest moves work rather than removing it, so
the obvious worry is that whole-repo scans have quietly become the bottleneck.
Measured (warm, macOS), they have not:

| `npm run check` step | wall  |
| -------------------- | ----- |
| `test:coverage`      | 31.7s |
| `lint`               | 6.4s  |
| `typecheck`          | 6.3s  |
| `duplication`        | 0.5s  |

All 11 files in `src/test/meta/` plus `lint-suppression-limits.test.ts` run in
**1.7s wall / 3.9s CPU** — about 5% of the test step's wall time and 2.3% of its
CPU. What makes tests the slowest step is their size (607 files, 10,671 tests),
not the meta scans.

So a separate vitest project or a parallel CI job for the meta tests was
considered and **rejected**: it would save ~1.7s and cost a job with its own
`npm ci` and startup. Adding another whole-repo meta test is likewise not a
performance decision. (The unrelated failure mode — whole-repo scans timing out
when two `npm run check` runs overlap across worktrees — is a reason not to run
concurrent checks, not an argument for parallelizing them.)

## Rules with no replacement

Every rule in this section reported zero at migration time, so none of it broke
anything. They are split by whether anything was actually lost.

### Substituted or never enforced — settled, don't re-open

- `sonarjs/assertions-in-tests` — resolves imported `expect*` helpers through
  typescript-eslint parserServices, and oxlint JS plugins get no type
  information, so every helper-based assertion read as absent (100 false
  positives). `vitest/expect-expect` with `assertFunctionNames: ["expect*"]`
  covers the same ground natively and is enabled. The substitution was checked
  rather than assumed: a test whose only assertion is a local
  `expectSomething()` helper is correctly **not** reported. Nothing to rebuild.
- `unicorn/no-array-push-push` — a no-op deprecated alias in unicorn 69 for
  `prefer-single-call`, which was never enabled. No enforcement existed to lose.
- `eslint-comments/no-unused-disable` — configured but inert through the bridge,
  so the entries were removed rather than left claiming enforcement. oxlint's
  native `--report-unused-disable-directives` flag does the same job, but every
  directive it currently reports is a migration artifact (one
  `no-restricted-syntax` the meta-test port still reads, three
  `require-atomic-updates` documenting a rule that no longer runs), so it is
  left off rather than deleting comments that still carry meaning.

### Accepted losses — deliberately not rebuilt

- `require-atomic-updates` — needs dataflow analysis, so there is no honest meta
  test for it. Tolerable because the rule's shape is already baked into how the
  code is written: three suppressions across `webui/`, `evals/`, and `src/` name
  it explicitly, and six more sites carry comments explaining that the code is
  arranged the way it is to avoid tripping it. That is documentation the rule's
  absence does not erase.
- `import-x/no-extraneous-dependencies` — a package missing from `package.json`
  entirely still fails immediately, since rollup's node-resolve cannot find it
  and CI runs `npm ci` + `npm run build`. What is genuinely unguarded is the
  _phantom_ dependency: a package installed as someone else's transitive,
  imported directly, never declared. That resolves fine from `node_modules` and
  keeps resolving until a lockfile change removes the provider. A meta test is
  feasible but has to model `#` subpaths, `node:` builtins, type-only imports,
  and a deps/devDeps split across four bundles plus `webui/`, `evals/`,
  `scripts/`, and `e2e/` — real permanent surface against a failure that is loud
  (`could not resolve X`) and one line to fix. Left unguarded on purpose; a
  one-off `npx depcheck` is the cheaper answer if it ever comes up.
- `import-x/no-useless-path-segments`, `import-x/no-relative-packages` — no
  oxlint counterpart.
- `import-x/order` — no oxlint counterpart, and Prettier does not sort imports,
  so import grouping and ordering are now unenforced.

## unicorn rules kept alive through the bridge

oxlint's native `unicorn` plugin covers 22 of the 33 rules this repo used, but
not these 10 — every one a bug detector rather than a style preference, so they
run as `unicorn-js/*` through the aliased bridge:

`no-accidental-bitwise-operator`, `no-array-sort-for-min-max`,
`no-boolean-sort-comparator`, `no-duplicate-if-branches`,
`no-duplicate-logical-operands`, `no-duplicate-set-values`,
`no-impossible-length-comparison`, `no-invalid-argument-count`,
`no-mismatched-map-key`, `no-misrefactored-assignment`

Drop each one as oxlint implements it natively — the native name wins, and
keeping both would be ambiguous. oxlint errors on an unknown rule name in a JS
plugin, so a rule that disappears upstream fails the run loudly rather than
going quiet.

## Rules disabled where oxlint disagrees

Each has an override in `.oxlintrc.json` with the reason. Re-enable as oxlint
fixes them upstream:

- `vitest/no-conditional-expect` — fires on a branching assertion helper that is
  not itself a test callback; eslint-plugin-vitest only reports inside a test.
- `jsdoc/require-param` / `jsdoc/require-returns`, in test files — oxlint
  attributes an enclosing function's JSDoc to a nested arrow assigned to a
  global member. Repro: a documented
  `function f(): void { window.confirm = () => false; }` reports
  `require-returns` against the arrow.
- `typescript/no-unnecessary-type-assertion`, in one file — oxlint calls an
  assertion redundant that `tsc` requires.
- `no-unused-vars` counts `a[i++]` as never reading `i`. Too valuable to
  disable, so the one site reads and increments on separate lines instead.

Two nursery rules the eslint config had are left out for the same reason —
`@oxlint/migrate` skips them by default, and opting them back in bought only
false positives here: `no-unreachable-loop` flags a `for (;;)` retry loop that
does iterate, and `typescript/prefer-optional-chain` wants to rewrite a
`typeof window !== "undefined" && window.x` guard, where `?.` would still throw.
The other two nursery rules — `no-unnecessary-condition` and
`no-useless-assignment` — are enabled and clean.
