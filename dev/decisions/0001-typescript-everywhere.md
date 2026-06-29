# ADR-0001: TypeScript for all first-party code

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Producer Pal spans several runtimes: a Node.js MCP server, V8 code running
inside Max for Live, a stdio→HTTP portal, a Preact chat UI, build scripts, and
an evals/CLI harness. These could each reasonably have used plain JavaScript,
and the Max V8 environment in particular is JS-native.

## Decision

All first-party code (`src/`, `scripts/`, `evals/`, `webui/`, `e2e/`, config) is
TypeScript, type-checked under `strict` plus `noUncheckedIndexedAccess`. A
meta-check (`npm run validate:typescript-only`) guards against stray JS.

## Alternatives rejected

- **JS for the Max V8 bundle** — it runs JS anyway. Rejected: the Live API
  surface is large and weakly-typed at runtime; static types catch the property
  and path mistakes that are otherwise only found by running Ableton. The bundle
  is transpiled, so the runtime cost is zero.
- **Mixed JS/TS by area** — rejected to keep one toolchain, one lint/typecheck
  config family, and uniform editor support.

## Consequences

- Eight separate `tsconfig` projects (one per area) keep type-checking scoped
  and fast; all run under `npm run typecheck`.
- Raw Live API access is wrapped (`live-api-extensions.ts`) so the weak runtime
  types are contained behind a typed interface rather than leaking `any`.
- New runtimes are expected to follow suit; adding a JS file trips the
  meta-test.
