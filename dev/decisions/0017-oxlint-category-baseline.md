# ADR-0017: oxlint runs on categories, with an opt-out list

- **Status:** Accepted
- **Date logged:** 2026-07-30

## Context

The oxlint migration carried the eslint rule list over one-for-one: every rule
is named explicitly in `.oxlintrc.json`, and oxlint's own curated categories
were left off. That baseline is stable but blind — oxlint ships new rules
regularly, and none of them reach this codebase unless someone reads the release
notes and adds them by hand. Nobody was doing that.

Turning categories on measured at 6,410 violations for `correctness` +
`suspicious`, and about 112,000 with `pedantic` and `style` too. The latter two
are a rewrite, not a triage project, and they encode preferences this codebase
doesn't share — never candidates.

The 6,410 looked like a wall until they were grouped: they come from just 30
rules, and three of those account for 5,238. The distribution is what made this
tractable.

## Decision

Enable `correctness` and `suspicious` at the top level; leave `pedantic` and
`style` off. Carry an explicit opt-out list at the end of the overrides array
for the rules the codebase doesn't yet satisfy, each with its violation count
and reason.

**Deleting an entry is the unit of work**: fix the violations, drop the line,
and the rule is on for good. The list is the backlog. `dev/Linting.md` explains
how the opt-out section has to be structured.

Three groups came out of the triage:

- **Off permanently** — the rule is wrong here, not the code:
  `react/react-in-jsx-scope` (obsolete under the automatic JSX runtime),
  `no-underscore-dangle` (`__dirname` plus a deliberate `_private` convention),
  `import/no-unassigned-import` (CSS and test-setup side effects),
  `unicorn/prefer-add-event-listener` (IndexedDB and Web Audio handles), plus
  three narrow per-file exceptions.
- **Deferred** — real, worth doing, too big for one PR. Led by
  `typescript/no-unsafe-type-assertion` (2,236) and
  `vitest/require-mock-type-parameters` (1,317).
- **Fixed on adoption** — the remaining ~100, across 18 rules.

## Consequences

- **Autofix needs review, not trust.** Of the 25 violations `oxlint --fix`
  resolved, one rewrote `polyfillToReversed`'s body to call `toReversed()` — the
  method the polyfill exists to provide. The unit tests do catch it, but from
  the far end: `es2023-array.test.ts` deletes the natives before re-importing,
  so a case named for prototype installation dies on
  `toReversed is not a function`, which reads like a broken harness. Read a red
  suite in that file as a question about the polyfill body first.
- **Type-directed rules assume the types are honest.** Removing a "redundant"
  `String()` or `Boolean()` is only safe where the declared type is enforced —
  fine for zod-validated input, not for a hand-written ambient `.d.ts` or an
  unvalidated cast of an HTTP body.
- **New rules now arrive on their own.** An oxlint upgrade that adds a
  `correctness` rule fails the build until someone triages it. That's the point,
  and also the ongoing cost: upgrades are no longer guaranteed mechanical.
