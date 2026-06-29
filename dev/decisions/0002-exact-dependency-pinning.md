# ADR-0002: Exact dependency versions, no ranges

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Producer Pal ships **bundled** artifacts (the Max for Live device, the npm
package, the Claude Desktop extension). What a user runs is whatever was on the
build machine at build time. Semver ranges (`^`, `~`) make that
non-reproducible: two builds of the same commit can embed different transitive
code.

## Decision

Every version in `package.json` is exact. `.npmrc` sets `save-exact=true`, and
`src/test/package-json-versions.test.ts` fails CI on any range. Dependency bumps
come through Dependabot with deliberate cooldown windows.

## Alternatives rejected

- **Caret ranges + lockfile** — the lockfile pins transitives, but the top-level
  ranges still drift on a fresh `npm install` without `--frozen-lockfile`
  everywhere, and the intent ("this exact set was tested") is less legible.
  Rejected in favor of making the pin explicit and test-enforced.
- **Renovate/Dependabot auto-merge** — rejected; supply-chain cooldown (a fixed
  delay before adopting a new release) is preferred over adopting fresh releases
  immediately.

## Consequences

- Reproducible bundles from a given commit.
- More frequent, smaller dependency PRs (the cost of exact pinning), absorbed by
  grouped Dependabot updates and cooldowns.
- A new dependency added with a range is a CI failure, not a style nit.
