# ADR-0017: oxlint runs on categories, with an opt-out list

- **Status:** Accepted
- **Date logged:** 2026-07-30

## Context

The oxlint migration carried over the eslint rule list one-for-one: every rule
the project runs is named explicitly in `.oxlintrc.json`, and oxlint's own
curated categories (`correctness`, `suspicious`, `pedantic`, `style`) were left
off. That baseline is stable but blind — oxlint ships new rules regularly and
none of them reach this codebase unless someone goes looking through release
notes and adds them by hand. Nobody was doing that.

The measured cost of switching to categories:

| categories enabled       | violations |
| ------------------------ | ---------- |
| correctness + suspicious | 6,410      |
| all four                 | ~112,000   |

`pedantic` and `style` are not a triage project, they are a rewrite, and they
encode preferences this codebase does not share. They were never candidates.

`correctness` + `suspicious` looked like a wall until the violations were
grouped: 6,410 hits come from just **30 distinct rules**, and three of them
account for 5,238. The distribution, not the total, is what made this tractable.

## Decision

Enable `correctness` and `suspicious` at the top level. Leave `pedantic` and
`style` off. Carry an explicit, commented opt-out list for the rules the
codebase does not yet satisfy, at the end of the overrides array.

Each opt-out entry records the rule, its violation count when written, and why
it is off. **Deleting an entry is the unit of work**: fix the violations, drop
the line, and the rule is on for good. The list is the backlog.

Three groups came out of the triage:

**Off permanently — the rule is wrong here, not the code.**

- `react/react-in-jsx-scope` (1,685) — obsolete under the automatic JSX runtime.
- `no-underscore-dangle` (126) — 20 of them are `__dirname`; the rest are a
  deliberate `_private` convention.
- `import/no-unassigned-import` (79) — CSS and test-setup side-effect imports.
- `unicorn/prefer-add-event-listener` (11) — IndexedDB and Web Audio handles,
  where a single `onsuccess` is the idiomatic form.
- `no-extend-native` and `unicorn/no-array-reverse`, in `src/polyfills/` only —
  see the trap below.
- `typescript/no-unnecessary-type-conversion`, in `create-express-app.ts` only —
  the `Boolean()` calls on the `POST /config` body are a runtime guard on an
  unvalidated `as` cast, redundant against the types and load-bearing against
  the wire.

**Deferred — real, worth doing, too big for one PR.**

`typescript/no-unsafe-type-assertion` (2,236),
`vitest/require-mock-type-parameters` (1,317), `typescript/unbound-method`
(273), `unicorn/consistent-function-scoping` (133 in tests),
`vitest/require-to-throw-message` (104), `unicorn/no-array-sort` (101),
`typescript/no-base-to-string` (47), `typescript/consistent-return` (43),
`typescript/no-unnecessary-type-parameters` (12).

**Fixed on adoption** — the remaining ~100, across 18 rules.

## Consequences

**Ordering is load-bearing and counter-intuitive.** Naming a plugin in an
override re-seeds that plugin's category rules over the override's paths. An
opt-out placed early is silently undone by any later block that mentions the
same plugin — "most specific wins" does not apply to categories. The opt-out
section therefore goes **last**, and its `files`/`plugins` lists are copies of
the blocks that already enable those plugins. Naming a plugin over a path that
did not have it turns the plugin **on** there, with every rule it owns.

**Autofix needs review, not trust.** `oxlint --fix` resolved 25 violations. One
of them rewrote `polyfillToReversed`'s body from `[...arr].reverse()` to
`[...arr].toReversed()` — the polyfill calling the method it exists to provide.
The unit tests do catch it — `es2023-array.test.ts` deletes the natives in a
`beforeAll` before re-importing, so the rewritten body fails there — but they
report it from the far end: a case named for prototype installation dies on
`toReversed is not a function`, which reads as a broken harness rather than a
rewritten polyfill. Read a red suite in that file as a question about the
polyfill body first. Another removed a `as string` that `tsc` requires under
`noUncheckedIndexedAccess`, caught by typecheck. A third fought
`no-unsafe-enum-comparison`: the cast that rule wants is the cast
`no-unnecessary-type-assertion`'s fixer deletes, so `npm run fix` undid the fix
on every run until the widening moved to a typed module constant.

**Type-directed rules assume the types are honest.** Removing a "redundant"
`String()` or `Boolean()` is only safe where the declared type is enforced —
zod-validated input, yes; a hand-written ambient `.d.ts` for a host object or an
unvalidated cast of an HTTP body, no. Both cases showed up in the same rule.

**New rules now arrive on their own.** An oxlint upgrade that adds a
`correctness` rule will fail the build until someone triages it. That is the
point, and it is also the ongoing cost: upgrades are no longer guaranteed
mechanical.
