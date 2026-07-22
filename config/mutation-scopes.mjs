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

// src/shared holds cross-cutting utility modules (pitch, notation, compact
// serializer/parser, path builders, mcp-response, config, error-utils, v8
// console/sleep, silent-wav, version-check) imported by both the Node MCP
// server and the V8 Max runtime. It is NOT under src/tools/, so toolDomain()
// can't build its globs; and its scope key can't be `shared` — that already
// means src/tools/shared — hence `sharedRuntime`. Same exclusions as a tool
// domain (tests, test/mock helpers, types-only) minus `.def.ts`/`*-disabled.ts`
// (no tool defs or feature-flag stubs live here); all are future-proofing —
// src/shared currently has none of them.
const SHARED_RUNTIME_GLOBS = [
  "src/shared/**/*.ts",
  "!src/shared/**/*.test.ts",
  "!src/shared/**/tests/**",
  "!src/shared/**/*-test-helpers.ts",
  "!src/shared/**/*-mock-helpers.ts",
  "!src/shared/**/types.ts",
];

// src/mcp-server is the Node-for-Max side: the Express app, MCP server wiring,
// REST routes, the live-library SQLite reader, markdown/memory/skill override
// stores, and the RPC protocol to the V8 runtime. It is NOT under src/tools/ so
// toolDomain() can't build its globs; its scope key is `mcpServer` (camelCase,
// non-colliding with any tool domain). Same exclusions as sharedRuntime (tests,
// test/mock helpers, types-only) minus `.def.ts`/`*-disabled.ts` (no tool defs
// or feature-flag stubs live here). `library-types.ts` is intentionally NOT
// excluded — it carries real logic (clampLibraryLimit + limit constants), not
// just type aliases.
const MCP_SERVER_GLOBS = [
  "src/mcp-server/**/*.ts",
  "!src/mcp-server/**/*.test.ts",
  "!src/mcp-server/**/tests/**",
  "!src/mcp-server/**/*-test-helpers.ts",
  "!src/mcp-server/**/*-mock-helpers.ts",
  "!src/mcp-server/**/types.ts",
  // mcp-server.ts is the Node-for-Max bundle entry point: importing it runs
  // module-load side effects (imports `max-api`, registers Node routes, binds
  // `.listen()`), so it's exercised by the e2e suites, not unit tests, and is
  // already coverage-excluded in vitest.config.ts. Exclude it here too (same
  // rationale as `.def.ts`/`*-disabled.ts` in toolDomain) — its ~57 mutants are
  // all NoCoverage bootstrap wiring, not assertable behavior.
  "!src/mcp-server/mcp-server.ts",
];

// src/live-api-adapter is the Max V8 runtime side: the LiveAPI wrapper
// interface, path helpers, and the V8 half of the RPC protocols to Node. It is
// the counterpart to mcpServer (the Node-for-Max side) and, like it, is NOT
// under src/tools/ so toolDomain() can't build its globs; its scope key is
// `v8Adapter` (camelCase, non-colliding with any tool domain). Same exclusions
// as sharedRuntime minus `.def.ts`/`*-disabled.ts` (no tool defs or
// feature-flag stubs live here). code-exec-v8-protocol.ts IS included: it is
// coverage-THRESHOLD-excluded (covering its async Node round-trip isn't worth
// it) but its pure paths are unit-tested, so it carries real mutable behavior.
const V8_ADAPTER_GLOBS = [
  "src/live-api-adapter/**/*.ts",
  "!src/live-api-adapter/**/*.test.ts",
  "!src/live-api-adapter/**/tests/**",
  "!src/live-api-adapter/**/*-test-helpers.ts",
  "!src/live-api-adapter/**/*-mock-helpers.ts",
  "!src/live-api-adapter/**/types.ts",
  // live-api-adapter.ts is the V8 bundle entry point: importing it runs
  // module-load side effects (emits `outlet(0, "started")`, registers Max
  // message handlers), so it's exercised by the e2e suites, not unit tests, and
  // is already coverage-excluded in vitest.config.ts. Exclude it here too (same
  // rationale as mcp-server.ts in MCP_SERVER_GLOBS) — its mutants are all
  // NoCoverage bootstrap wiring, not assertable behavior.
  "!src/live-api-adapter/live-api-adapter.ts",
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
  advanced: 97, // triaged 2026-07-15 at 98.60% (see dev/Mutation-Testing.md)
  core: 99, // triaged 2026-07-15 at 100.00% (see dev/Mutation-Testing.md)
  scene: 96, // triaged 2026-07-15 at 97.66% (see dev/Mutation-Testing.md)
  "live-set": 98, // triaged 2026-07-15 at 99.07% (see dev/Mutation-Testing.md)
  shared: 94, // triaged 2026-07-16 at 95.25% (see dev/Mutation-Testing.md)
};

// The sharedRuntime (src/shared) break gate. Triaged 2026-07-15 at 94.94%; the
// floor sits ~1 point below for run-to-run timeout-classification variance
// (matching notation's ratchet). Remaining survivors are all equivalent /
// defensive / static-init mutants (see dev/Mutation-Testing.md).
const SHARED_RUNTIME_BREAK = 94;

// The mcpServer (src/mcp-server) break gate. Triaged 2026-07-15 at 88.51% (the
// bundle entry point mcp-server.ts is excluded); the floor sits ~1.5 points
// below — this domain is infra-heavy (Express wiring, Max.outlet device
// notifications, dynamic SQL) with several timeout-prone SQLite/fs tests, so it
// carries a slightly wider buffer than the pure-logic scopes. Remaining
// survivors are overwhelmingly bucket 2/3: device-notification side-effects,
// dynamic SQL builders, log/header strings, readdir-order-equivalent sorts, and
// the perTest guard-attribution quirk (see dev/Mutation-Testing.md).
const MCP_SERVER_BREAK = 87;

// The v8Adapter (src/live-api-adapter) break gate. Triaged 2026-07-16 at 97.97%
// (the bundle entry point live-api-adapter.ts is excluded); the floor sits ~1
// point below, matching notation's ratchet. This scope is unusually
// timeout-classification-noisy: live-api-extensions.ts patches the global
// LiveAPI at test-SETUP time, so most of its mutants are static — Stryker runs
// the whole suite for each, and a mutant that breaks the patch breaks setup for
// every test file, blowing the time budget and landing as Timeout (counted as
// killed) rather than Killed. Which mutants tip over varies per run: two
// observed runs scored 98.22% and 97.97%, so the floor is set from the lower.
// Remaining survivors are all equivalent / log-string / thin-orchestration
// mutants (see dev/Mutation-Testing.md).
const V8_ADAPTER_BREAK = 97;

export const SCOPES = {
  notation: { mutate: NOTATION_GLOBS, break: 86 },
  sharedRuntime: { mutate: SHARED_RUNTIME_GLOBS, break: SHARED_RUNTIME_BREAK },
  mcpServer: { mutate: MCP_SERVER_GLOBS, break: MCP_SERVER_BREAK },
  v8Adapter: { mutate: V8_ADAPTER_GLOBS, break: V8_ADAPTER_BREAK },
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
  all: ["notation", "sharedRuntime", "mcpServer", "v8Adapter", ...TOOL_DOMAINS],
};
