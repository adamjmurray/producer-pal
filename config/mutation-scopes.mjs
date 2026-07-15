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
// test helpers, and type-only modules — none carry mutable behavior worth
// asserting on. (src/tools/ currently has no types.ts, but the exclusion is
// kept for parity with the notation scope and future-proofing.)
function toolDomain(name) {
  const dir = `src/tools/${name}`;

  return [
    `${dir}/**/*.ts`,
    `!${dir}/**/*.test.ts`,
    `!${dir}/**/tests/**`,
    `!${dir}/**/*-test-helpers.ts`,
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

// Tool domains: one subdirectory each under src/tools/. break stays null until
// each domain's survivors are triaged in its own PR (src/tools/constants.ts is
// a plain root-level constants module, intentionally left unscoped).
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

export const SCOPES = {
  notation: { mutate: NOTATION_GLOBS, break: 86 },
  ...Object.fromEntries(
    TOOL_DOMAINS.map((name) => [
      name,
      { mutate: toolDomain(name), break: null },
    ]),
  ),
};

// Named groups the runner expands into multiple scopes.
export const SCOPE_GROUPS = {
  tools: [...TOOL_DOMAINS],
  all: ["notation", ...TOOL_DOMAINS],
};
