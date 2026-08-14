// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Swaps the code-execution modules for stubs that export the same interface and
// do nothing, keeping node:vm and all execution logic out of release bundles.
//
// This is a resolveId hook, not a `resolve.alias` entry, because alias never
// sees a `#src/…` specifier: those are Node subpath imports and resolve first.
// Aliasing them by hand shipped the real module AND the stub in one bundle,
// each with its own copy of the pending-request state.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Real module → the stub that replaces it. Matched against an import's RESOLVED
 * path, so it makes no difference whether a caller wrote `./x.ts` or `#src/…`.
 */
const STUBS = {
  "src/live-api-adapter/code-exec-v8-protocol.ts":
    "src/tools/clip/code-exec/code-exec-v8-protocol-disabled.ts",
  "src/mcp-server/code-executor.ts":
    "src/tools/clip/code-exec/code-executor-disabled.ts",
  "src/mcp-server/code-exec-protocol.ts":
    "src/tools/clip/code-exec/code-exec-protocol-disabled.ts",
};

/**
 * Build the stub-substitution plugin. Only add it when code execution is off.
 *
 * @returns A rolldown plugin
 */
export function stubCodeExec() {
  const byRealPath = buildStubMap();

  return {
    name: "stub-code-exec",
    resolveId(source, importer) {
      const target = resolveSource(source, importer);

      return target == null ? null : (byRealPath.get(target) ?? null);
    },
  };
}

/**
 * Resolve the table to absolute paths, failing the build on a stale entry.
 * A rename that missed the table would otherwise silently ship the real module.
 *
 * @returns Absolute real-module path → absolute stub path
 */
function buildStubMap() {
  const map = new Map();

  for (const [real, stub] of Object.entries(STUBS)) {
    for (const path of [real, stub]) {
      if (!existsSync(join(rootDir, path))) {
        throw new Error(
          `stub-code-exec: ${path} no longer exists. Update STUBS in ` +
            "config/rolldown-plugin-stub-code-exec.mjs to match the rename.",
        );
      }
    }

    map.set(join(rootDir, real), join(rootDir, stub));
  }

  return map;
}

/**
 * Turn an import specifier into the absolute file it names, or null when it
 * isn't one of ours. Mirrors the `#src/*` subpath import from package.json.
 *
 * @param source - The import specifier as written
 * @param importer - The importing file, for relative specifiers
 * @returns The absolute path, or null
 */
function resolveSource(source, importer) {
  if (source.startsWith("#src/")) {
    return join(rootDir, "src", source.slice("#src/".length));
  }

  if (source.startsWith("./") || source.startsWith("../")) {
    return importer == null ? null : resolve(dirname(importer), source);
  }

  return null;
}
