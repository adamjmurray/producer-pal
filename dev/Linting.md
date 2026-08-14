# Linting

`npm run lint` runs [oxlint](https://oxc.rs) with `--type-aware`. Config is
`.oxlintrc.json` (JSONC — it carries comments). Formatting is oxfmt
(`.oxfmtrc.json`).

oxlint replaced eslint for speed: 5.8s wall / 13s CPU versus 31s / 183s on the
same rule set. `npm run check` runs before every push, so this was the single
biggest cost in the loop.

## How the config is organized

Blocks are grouped by which trees share a rule. Each rule appears exactly once,
in a block whose `files` is the union of the trees that carry it — read a
block's `files` as "these trees agree about these rules."

**To change one tree's rules, move the rule into a block matching only that
tree.** Never edit a shared block's `files` — that silently changes every other
tree in it.

This works because oxlint's overrides **merge** (top-level first, then each
matching override in array order, later winning per rule). eslint's `rules`
entries replaced rather than merged, which is why the migrated config repeated
every rule in every block.

Two more kinds of block follow the groups: keys-only blocks carrying `env` per
tree, then narrow per-path exceptions, each with its reason.

### The category opt-out section

`correctness` and `suspicious` are enabled as whole categories at the top level;
`pedantic` and `style` are not (see
[ADR-0017](decisions/0017-oxlint-category-baseline.md)). The last section of the
overrides array turns back off the category rules this codebase doesn't satisfy
yet, one commented entry per rule with its violation count. Deleting an entry is
the unit of work: fix the violations, drop the line, and the rule stays on.

Every entry is marked **PERMANENT** (the rule is wrong for this codebase — don't
re-litigate it) or **DEFERRED** (worth doing, too big for one sitting). The
deferred ones are the backlog and have tickets.

Two structural rules keep that section working, and both are easy to get wrong:

1. **It has to go last.** Naming a plugin in an override re-seeds that plugin's
   category rules over the override's paths, so an opt-out placed earlier is
   silently undone by any later block mentioning the same plugin. The later-wins
   merge governs explicitly-named rules; categories don't follow it.
2. **Its `files` and `plugins` lists are copies, not new surface.** Naming a
   plugin over a path that didn't already have it turns the plugin **on** there
   — and with categories enabled, that means every rule it owns. When a block
   above changes its trees, the matching opt-out block moves with it.

One block breaks rule 2 deliberately: the test-scoped `unicorn` opt-out uses the
canonical test globs (which `test-file-classification.test.ts` requires) rather
than a hand-rolled list, so it widens unicorn onto the e2e and docs suites. That
only surfaced rules already deferred, and the rest of the plugin is new coverage
there.

## Every file must resolve to a non-empty rule map

Nothing is hoisted: the top-level `rules` is empty, so a tree that appears in no
`files` list is linted with **zero rules** and reports clean — indistinguishable
from passing. Fourteen files were in that blind spot (`e2e/ui/**`,
`docs/.vitepress/**`, `evals/**/*.mjs`), each a tree created without being added
to the old eslint config.

When you add a tree, check it:

```bash
oxlint --debug=files   # every file oxlint lints
```

Resolve each path against the override `files` globs and assert at least one
rule is left enabled. Add a new tree to the blocks whose rules it already agrees
with — don't hoist a shared set to the top level, and don't write a new block
repeating rules that live elsewhere. This is deliberately not a meta test: the
answer for a new tree is a judgment about which rules it agrees with, not a
default.

`.vue` files are linted through their `<script>` block only.

## The JS-plugin bridge

All 26 type-aware `@typescript-eslint` rules are native, via `oxlint-tsgolint`.
Four plugins run through oxlint's ESLint-compatible bridge, so their packages
stay devDependencies: `eslint-plugin-sonarjs`, `@stylistic/eslint-plugin`,
`@eslint-community/eslint-plugin-eslint-comments`, and `eslint-plugin-unicorn`.

The bridge is why `typescript` resolves to the TypeScript 6 API even though
`npm run typecheck` runs TypeScript 7 — see "Why the bridge pins TypeScript 6"
below.

`unicorn` is a reserved native plugin name, so the bridged copy is aliased and
its rules carry a distinct prefix:

```json
"jsPlugins": [{ "name": "unicorn-js", "specifier": "eslint-plugin-unicorn" }],
"rules": { "unicorn-js/no-duplicate-logical-operands": "error" }
```

oxlint's native unicorn covers 22 of the 35 rules we use; 13 run through the
bridge as `unicorn-js/*`, every one a bug detector rather than a style
preference. Drop each as oxlint implements it natively — the native name wins.

**Gotchas:**

- An override that names a rule must also list that rule's plugin in its own
  `plugins`/`jsPlugins`, even when it only turns the rule off. Nothing
  accumulates across overrides, and declaring the plugin elsewhere fails
  silently.
- **Write suppression directives with the `eslint-` prefix.** The bridge only
  sees that spelling, so `eslint-comments/require-description` never fires on an
  `oxlint-disable`.
- **Never put a lint directive on line 1 of a file.** The bridge's line/column
  translation is off by one, so a line-1 directive computes a negative offset
  and `require-description` dies with a `RangeError`. The run fails loudly, but
  the stack trace replaces every other JS-plugin finding in that file. The SPDX
  header keeps line 1 occupied everywhere except `examples/**` and
  `docs/.vitepress/**`.
- Bridged rules get no type information, so a rule that needs types
  under-reports silently rather than erroring.

## Where oxlint's defaults differ from eslint's

A bare rule name adopts oxlint's defaults, which don't always match eslint's.
Reviewing all 56 such entries found four divergences; three were weakenings and
are now spelled out explicitly in `.oxlintrc.json`:

- `no-eval` — oxlint defaults `allowIndirect` to true, permitting
  `(0, eval)(x)`, which is the bypass the rule exists to catch.
- `no-irregular-whitespace` — oxlint skips comments, templates, regexes, and
  JSX; eslint skips only strings.
- `jsdoc/require-param` — oxlint skips constructors and checks getters/setters;
  eslint-plugin-jsdoc does the reverse.

The fourth is oxlint being stricter and is left alone
(`unicorn/prefer-number-properties` reports a bare `NaN`).

This class of error is mostly self-limiting: oxlint hard-fails on an unknown
option key, and the bridge validates against the real plugin's schema. The
exception is `import/extensions`, whose options are a free-form map, so unknown
keys are dropped silently.

One trap: `restrict-template-expressions`' `{ from: "file" }` entry resolves its
path against the **TypeScript project root**, which is `src/` here — not the
repo root.

## Rules that moved to meta tests

oxlint has no equivalent for arbitrary AST selectors (`no-restricted-syntax`),
the import zone graph (`import-x/no-restricted-paths`), or
`no-restricted-imports`' regex form. Those are now vitest meta tests, which
honor `eslint-disable` directives so they're no stricter than the rules they
replace:

| was                                     | now                                         |
| --------------------------------------- | ------------------------------------------- |
| `no-restricted-syntax` (webui, LiveAPI) | `src/test/meta/import-restrictions.test.ts` |
| `import-x/no-restricted-paths`          | `src/test/meta/import-restrictions.test.ts` |
| `no-restricted-imports` regex form      | `src/test/meta/import-restrictions.test.ts` |
| `jsdoc/require-jsdoc`                   | `src/test/meta/jsdoc-requirements.test.ts`  |

One isn't a straight port. The eslint config carried a src-wide ban on every
`..` specifier that never actually ran, because a later block replaced the whole
`no-restricted-syntax` entry. Reviving it as written would have been a new rule:
`src/` holds 475 parent-relative specifiers, nearly all of them files the
file-organization rules pushed into `helpers/` or `tests/` reaching back up to
their own module root. What's enforced instead is the boundary the code already
respects — **a relative import must stay inside its own top-level `src/`
module**. 473 of the 475 comply; the 2 that don't reach the repo-root
`package.json`, which leaves `src/` entirely and is exempt. webui's identical
total ban was never shadowed and is enforced as written.

`eslint-comments/no-unlimited-disable` couldn't survive the bridge for a
circular reason: a file-wide disable turns off every rule including the one that
would report it. `src/test/lint-suppression-limits.test.ts` is the sole backstop
now, and it also matches oxlint's bare `// oxlint-disable` line comment, which
oxlint (unlike eslint) treats as file-wide.

Every check in those tests is verified by injecting a known violation, not just
by passing on a clean tree.

Splitting the meta tests into their own vitest project or CI job was considered
and rejected: all 12 of them run in 1.7s, about 5% of the test step. Test volume
is what makes that step slow, not the meta scans.

## Rules with no replacement

Every rule here reported zero at migration time, so nothing broke.

**Settled, don't re-open:**

- `sonarjs/assertions-in-tests` — needs type information the bridge doesn't
  provide, so every helper-based assertion read as absent (100 false positives).
  `vitest/expect-expect` with `assertFunctionNames: ["expect*"]` covers the same
  ground natively and is enabled.
- `unicorn/no-array-push-push` — a no-op deprecated alias. No enforcement to
  lose.
- `eslint-comments/no-unused-disable` — inert through the bridge. oxlint's
  native `--report-unused-disable-directives` does the same job, but everything
  it currently reports is a migration artifact carrying meaning, so it's left
  off.

**Accepted losses, deliberately not rebuilt:**

- `require-atomic-updates` — needs dataflow analysis, so there's no honest meta
  test. Tolerable because the rule's shape is baked into how the code is
  written; nine sites name it or explain the arrangement that avoids it.
- `import-x/no-extraneous-dependencies` — a package missing from `package.json`
  already fails the build, since node-resolve can't find it. What's genuinely
  unguarded is a _phantom_ dependency: something installed as a transitive,
  imported directly, never declared. A meta test would have to model `#`
  subpaths, `node:` builtins, type-only imports, and a deps/devDeps split across
  four bundles plus four other trees — real permanent surface against a failure
  that's loud and one line to fix. A one-off `npx depcheck` is the cheaper
  answer if it ever comes up.
- `import-x/no-useless-path-segments`, `import-x/no-relative-packages`,
  `import-x/order` — no oxlint counterpart. Import ordering stays unenforced:
  oxfmt's `sortImports` would cover it, but it breaks `vi.mock` hoisting in the
  webui suites. See `dev/Testing.md`.

## Why the bridge pins TypeScript 6

TypeScript 7 is the Go port and ships **no programmatic API** — its `typescript`
package root export is `lib/version.cjs`, just the version string. Upstream
expects to ship a new API in 7.1.

Every bridged plugin reaches the compiler API transitively (sonarjs through
`ts-api-utils`, which reads `ts.TypeFlags` at module load), so under a plain TS
7 install oxlint dies before linting anything:

```
x Failed to load JS plugin: eslint-plugin-sonarjs
|   TypeError: Cannot read properties of undefined (reading 'Intrinsic')
```

There is nothing to upgrade to. `typescript-eslint` closed its TypeScript 7
support request as `not_planned` — "there is no TS 7 API at this time" — and
SonarSource then capped `eslint-plugin-sonarjs` to `typescript >=5 <6.1.0` to
stay inside that window. Dropping sonarjs would cost 27 configured rules,
including `sonarjs/no-identical-functions`, this repo's DRY enforcement.

So `package.json` uses the upstream-recommended side-by-side aliasing: the
`typescript` name resolves to `@typescript/typescript6` (full 6.0.3 API, for the
bridge), and TypeScript 7 is installed as `@typescript/native`, whose `tsc` is
what `npm run typecheck` runs. Nothing needs the two to agree —
`oxlint-tsgolint` carries its own typescript-go checker, so type-aware linting
is already on a TS-7-era engine regardless.

Revisit when `typescript-eslint` supports the 7.1 API and sonarjs lifts its cap;
at that point both aliases collapse back to a plain `typescript` pin.

## Rules disabled where oxlint disagrees

Each has an override in `.oxlintrc.json` with its reason. Re-enable as oxlint
fixes them upstream:

- `vitest/no-conditional-expect` — fires on a branching assertion helper that
  isn't itself a test callback.
- `jsdoc/require-param` / `require-returns` / `require-yields`, in test files —
  oxlint attributes an enclosing function's JSDoc to a nested arrow or
  generator.
- `typescript/no-unnecessary-type-assertion`, in two files — oxlint calls an
  assertion redundant that `tsc` requires under `noUncheckedIndexedAccess`. Its
  fixer also fights `no-unsafe-enum-comparison`: the `as number` one wants is
  the assertion the other deletes, so a fix at the comparison site doesn't
  survive `npm run fix`. Widen through a typed module constant instead.
- `typescript/no-unnecessary-type-conversion`, in `create-express-app.ts` — the
  `Boolean()` calls are a runtime guard on an unvalidated request body,
  redundant against the declared types and load-bearing against the wire.
- `no-unused-vars` counts `a[i++]` as never reading `i`. Too valuable to
  disable, so the one site reads and increments on separate lines.

Two nursery rules are left out for the same reason: `no-unreachable-loop` flags
a `for (;;)` retry loop that does iterate, and
`typescript/prefer-optional-chain` wants to rewrite a
`typeof window !== "undefined"` guard where `?.` would still throw. The other
two nursery rules are enabled and clean.
