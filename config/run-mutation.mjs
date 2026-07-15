// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Runner for scoped mutation testing. Expands the requested scope/group names,
// then runs Stryker once per scope with MUTATION_SCOPE set, aggregating exit
// codes (non-zero if any scope's break gate fires). Driven by `npm run mutation`.
//
// Usage:
//   npm run mutation                 # default: notation
//   npm run mutation -- clip         # one tool domain
//   npm run mutation -- tools        # all tool domains (group)
//   npm run mutation -- notation clip
//   npm run mutation -- all          # notation + every tool domain
//
// Plain ESM (not scripts/*.ts) so it needs no build step and can import the
// .mjs scope table directly.

import { spawnSync } from "node:child_process";
import { SCOPES, SCOPE_GROUPS } from "./mutation-scopes.mjs";

// Expand group names into their member scopes, validate each, de-dupe while
// preserving order. Throws on an unknown name (listing what is known).
function resolveScopes(args) {
  const requested = args.length > 0 ? args : ["notation"];
  const expanded = [];

  for (const name of requested) {
    if (SCOPE_GROUPS[name] != null) {
      expanded.push(...SCOPE_GROUPS[name]);
    } else if (SCOPES[name] != null) {
      expanded.push(name);
    } else {
      const known = [...Object.keys(SCOPES), ...Object.keys(SCOPE_GROUPS)].join(
        ", ",
      );

      throw new Error(`Unknown mutation scope "${name}". Known: ${known}`);
    }
  }

  return [...new Set(expanded)];
}

// Regenerate the peggy parsers first (tests import them transitively). Fail
// fast if that step errors.
function buildParsers() {
  const result = spawnSync("npm", ["run", "parser:build"], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const scopes = resolveScopes(process.argv.slice(2));

buildParsers();

let failed = false;

for (const scope of scopes) {
  console.log(`\n=== Mutation testing scope: ${scope} ===\n`);
  const result = spawnSync(
    "npx",
    ["stryker", "run", "config/stryker.config.mjs"],
    {
      stdio: "inherit",
      env: { ...process.env, MUTATION_SCOPE: scope },
    },
  );

  if (result.status !== 0) {
    failed = true;
    console.error(
      `\n✗ Mutation scope "${scope}" failed (exit ${result.status}).`,
    );
  }
}

process.exit(failed ? 1 : 0);
