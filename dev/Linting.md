# Linting

`npm run lint` runs [oxlint](https://oxc.rs) with `--type-aware`. Configuration
lives in `.oxlintrc.json` (JSONC — it may carry comments, and does).

Formatting is still Prettier; oxfmt is tracked separately.

## Why oxlint

Measured on this repo (1467 files, warm cache, macOS):

| tool                              | wall  | CPU  |
| --------------------------------- | ----- | ---- |
| eslint                            | 31.1s | 183s |
| oxlint, type-aware, same rule set | 4.9s  | 12s  |

`npm run check` is run before every push, so this is the single biggest cost in
the loop.

## How the config was produced

```bash
npx @oxlint/migrate eslint.config.js --type-aware --js-plugins --with-nursery
```

That converts 226 of 262 rules and reproduces every override block. The header
comment in `.oxlintrc.json` lists the edits the generator cannot make itself.

All 26 type-aware `@typescript-eslint` rules are native, through
`oxlint-tsgolint` (a typescript-go checker, stable since 2026-07). Three plugins
have no native equivalent and run through oxlint's ESLint-compatible `jsPlugins`
bridge, so their packages remain devDependencies: `eslint-plugin-sonarjs`,
`@stylistic/eslint-plugin`, and
`@eslint-community/eslint-plugin-eslint-comments`.

**Gotcha:** an override that names a rule must also list that rule's plugin in
its own `plugins` array — even when the entry only turns the rule off. Without
it the entry is silently ignored, with no error.

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
| `eslint-comments/no-unlimited-disable`  | `src/test/lint-suppression-limits.test.ts`  |

Every check in those tests is verified by injecting a known violation, not just
by passing on a clean tree.

## Rules with no replacement

Enforcement genuinely lost in the migration, all previously reporting zero:

- `require-atomic-updates` — needs dataflow analysis; not portable to a meta
  test. One `evals/` suppression documents the pattern it used to guard.
- `import-x/no-extraneous-dependencies` — importing a package absent from
  `package.json` is now caught only at build/test time.
- `sonarjs/assertions-in-tests` — resolves imported `expect*` helpers through
  typescript-eslint parserServices, and oxlint JS plugins get no type
  information, so every helper-based assertion read as absent (100 false
  positives). `vitest/expect-expect` with `assertFunctionNames: ["expect*"]`
  covers the same ground natively and is enabled.

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
