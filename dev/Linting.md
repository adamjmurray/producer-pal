# Linting

`npm run lint` runs [oxlint](https://oxc.rs) with `--type-aware`. Configuration
lives in `.oxlintrc.json` (JSONC — it may carry comments, and does).

Formatting is still Prettier; oxfmt is tracked separately.

## Why oxlint

Measured on this repo (1467 files, warm cache, macOS):

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

All 26 type-aware `@typescript-eslint` rules are native, through
`oxlint-tsgolint` (a typescript-go checker, stable since 2026-07). Four plugins
run through oxlint's ESLint-compatible `jsPlugins` bridge, so their packages
remain devDependencies: `eslint-plugin-sonarjs`, `@stylistic/eslint-plugin`,
`@eslint-community/eslint-plugin-eslint-comments`, and `eslint-plugin-unicorn`.

The first three have no native equivalent at all. `unicorn` is different: oxlint
implements 22 of the 33 rules this repo uses natively, and the bridge supplies
the other 10 (see below). Because `unicorn` is a reserved native plugin name,
the bridged copy is aliased and its rules carry a distinct prefix:

```json
"jsPlugins": [{ "name": "unicorn-js", "specifier": "eslint-plugin-unicorn" }],
"rules": { "unicorn-js/no-duplicate-logical-operands": "error" }
```

**Gotchas:**

- An override that names a rule must also list that rule's plugin in its own
  `plugins` array — even when the entry only turns the rule off. Without it the
  entry is silently ignored, with no error. (`jsPlugins` and `plugins` do
  accumulate across matching overrides; it is the naming that must be local.)
- The bridge only sees `eslint-`prefixed suppression directives. oxlint itself
  honors `oxlint-disable` equally, but `eslint-comments/require-description`
  does not fire on it — so **write directives with the `eslint-` prefix**, and
  treat the `oxlint-` spelling as an escape hatch from the description
  requirement.
- Bridged rules get no type information (no `parserServices`), so a rule that
  needs types will silently under-report rather than error. This is why
  `sonarjs/assertions-in-tests` had to be dropped entirely.

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

`eslint-comments/no-unlimited-disable` is a partial case: it still runs through
the bridge, which covers the `eslint-` prefix, and
`src/test/lint-suppression-limits.test.ts` backstops the `oxlint-` prefix the
bridge cannot see. Note that oxlint (unlike ESLint) treats a bare
`// oxlint-disable` **line** comment as file-wide, so the backstop matches that
form as well as the block form.

Every check in those tests is verified by injecting a known violation, not just
by passing on a clean tree.

## Rules with no replacement

Enforcement genuinely lost in the migration, all previously reporting zero:

- `require-atomic-updates` — needs dataflow analysis; not portable to a meta
  test. Three suppressions across `webui/` and `evals/` document the pattern it
  used to guard.
- `import-x/no-extraneous-dependencies` — importing a package absent from
  `package.json` is now caught only at build/test time.
- `import-x/no-useless-path-segments`, `import-x/no-relative-packages` — no
  oxlint counterpart.
- `import-x/order` — no oxlint counterpart, and Prettier does not sort imports,
  so import grouping and ordering are now unenforced.
- `sonarjs/assertions-in-tests` — resolves imported `expect*` helpers through
  typescript-eslint parserServices, and oxlint JS plugins get no type
  information, so every helper-based assertion read as absent (100 false
  positives). `vitest/expect-expect` with `assertFunctionNames: ["expect*"]`
  covers the same ground natively and is enabled.
- `eslint-comments/no-unused-disable` — configured but inert through the bridge,
  so the entries were removed rather than left claiming enforcement. oxlint's
  native `--report-unused-disable-directives` flag does the same job, but every
  directive it currently reports is a migration artifact (one
  `no-restricted-syntax` the meta-test port still reads, three
  `require-atomic-updates` documenting a rule that no longer runs), so it is
  left off rather than deleting comments that still carry meaning.
- `unicorn/no-array-push-push` — a no-op deprecated alias in unicorn 69 for
  `prefer-single-call`, which was never enabled. No enforcement existed to lose.

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
