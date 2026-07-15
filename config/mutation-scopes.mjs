// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Mutation-testing scopes: named subsets of the source tree Stryker mutates
// independently. A whole-tree run is too slow (hours), so we run per-domain.
// `MUTATION_SCOPE` picks one scope (read by config/stryker.config.mjs); the
// runner (config/run-mutation.mjs) drives one or many.
//
// Each scope has:
//   mutate — Stryker `mutate` globs (project-root-relative)
//   break  — the thresholds.break gate. A NUMBER fails the run (exit 1) when
//            the score drops below it; NULL is baseline mode (measure, never
//            fail) until the domain has been triaged and earns a floor
//            ~1 point below its triaged score, matching notation's ratchet.

// Glob set for one tool domain under src/tools/. Excludes tests, test dirs,
// test/mock helpers, `.def.ts` tool definitions, `*-disabled.ts` build-time
// stubs, and type-only modules — none carry mutable behavior worth asserting on.
// `.def.ts` files are purely declarative (a `defineTool()` call: Zod schema +
// LLM-facing description strings, no logic): mutating a `.describe("…")` string
// just blanks prose that is eval-tested, not unit-tested, so asserting exact
// wording would over-fit and fight the description-iteration workflow. Schema
// constraints (`.min`/`.max`) are enforced by the MCP SDK, not our runtime code.
// `*-mock-helpers.ts` is test-only mock infrastructure (like
// `*-test-helpers.ts`); it stays source-classified for coverage but must not be
// mutated. `*-disabled.ts` are build-time substitution stubs swapped in by
// rollup when a feature flag is off (e.g. ENABLE_CODE_EXEC); tests run with the
// feature enabled so the stubs are never imported (all-NoCoverage by
// construction) — they are already coverage-excluded in vitest.config.ts, so
// exclude them here too. (src/tools/ currently has no types.ts, but that
// exclusion is kept for parity with the notation scope and future-proofing.)
function toolDomain(name) {
  const dir = `src/tools/${name}`;

  return [
    `${dir}/**/*.ts`,
    `!${dir}/**/*.test.ts`,
    `!${dir}/**/tests/**`,
    `!${dir}/**/*-test-helpers.ts`,
    `!${dir}/**/*-mock-helpers.ts`,
    `!${dir}/**/*.def.ts`,
    `!${dir}/**/*-disabled.ts`,
    `!${dir}/**/types.ts`,
  ];
}

// The notation scope's globs, preserved verbatim from the original single-scope
// config so its baseline (and the break: 86 ratchet) is unchanged.
const NOTATION_GLOBS = [
  "src/notation/**/*.ts",
  "!src/notation/**/*.test.ts",
  "!src/notation/**/tests/**",
  "!src/notation/**/*-test-helpers.ts",
  "!src/notation/types.ts",
  "!src/notation/peggy-parser-types.ts",
  "!src/notation/**/peggy-parser-types.ts",
];

// Tool domains: one subdirectory each under src/tools/ (src/tools/constants.ts
// is a plain root-level constants module, intentionally left unscoped).
const TOOL_DOMAINS = [
  "actions",
  "advanced",
  "clip",
  "core",
  "device",
  "live-set",
  "scene",
  "session",
  "shared",
  "track",
];

// Per-domain break gate (mutation-score floor). A domain stays in baseline mode
// (absent here → null, measure-only) until its survivors are triaged in its own
// PR; it then earns a floor ~1 point below its triaged score, matching
// notation's ratchet. Raise a floor as the score climbs; never lower one
// without triaging why.
const TOOL_DOMAIN_BREAKS = {
  track: 85, // triaged 2026-07-14 at 86.15% (see dev/Mutation-Testing.md)
  session: 89, // triaged 2026-07-14 at 90.46% (see dev/Mutation-Testing.md)
  actions: 90, // triaged 2026-07-15 at 91.79% (see dev/Mutation-Testing.md)
  device: 90, // triaged 2026-07-15 at 91.18% (see dev/Mutation-Testing.md)
  clip: 96, // triaged 2026-07-15 at 97.48% (see dev/Mutation-Testing.md)
};

export const SCOPES = {
  notation: { mutate: NOTATION_GLOBS, break: 86 },
  ...Object.fromEntries(
    TOOL_DOMAINS.map((name) => [
      name,
      { mutate: toolDomain(name), break: TOOL_DOMAIN_BREAKS[name] ?? null },
    ]),
  ),
};

// Named groups the runner expands into multiple scopes.
export const SCOPE_GROUPS = {
  tools: [...TOOL_DOMAINS],
  all: ["notation", ...TOOL_DOMAINS],
};
