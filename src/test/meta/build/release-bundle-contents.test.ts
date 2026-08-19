// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A release build must not contain the code-execution modules. The stubs are
// swapped in by a resolveId hook, which is easy to break silently: an earlier
// `resolve.alias` version looked right and did nothing for `#src/…` specifiers,
// so the real module and its stub both shipped, each with its own state.
//
// So this builds the release bundles for real and inspects which modules went
// in — the artifact, not the config text.

import { rolldown, type InputOptions, type RolldownOutput } from "rolldown";
import { beforeAll, describe, expect, it } from "vitest";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";

/** Modules that must never reach a build without ENABLE_CODE_EXEC. */
const REAL_CODE_EXEC_MODULES = new Set([
  "src/live-api-adapter/code-exec-v8-protocol.ts",
  "src/mcp-server/code-executor.ts",
  "src/mcp-server/code-exec-protocol.ts",
]);

// Absence alone would also pass if the import were simply deleted, so each
// bundle names the stub that has to be standing in its place. The portal
// reaches no code-exec module today, so it has none to name — it is covered
// because it ships, and an import added later must arrive stubbed.
const BUNDLES = [
  {
    name: "live-api-adapter",
    index: 0,
    stub: "src/tools/clip/code-exec/code-exec-v8-protocol-disabled.ts",
  },
  {
    name: "mcp-server",
    index: 1,
    stub: "src/tools/clip/code-exec/code-exec-protocol-disabled.ts",
  },
  { name: "portal", index: 2, stub: null },
] as const;

const moduleIds: Record<string, string[]> = {};

beforeAll(async () => {
  // The config reads this at import time; a shell that happens to export it
  // would otherwise turn this whole suite into a no-op.
  delete process.env.ENABLE_CODE_EXEC;

  const config = await import("../../../../config/rolldown.config.mjs");
  const configs = config.default as (InputOptions & { output: unknown })[];

  for (const { name, index } of BUNDLES) {
    moduleIds[name] = await buildModuleIds(configs[index] as InputOptions);
  }
}, 120_000);

describe.each(BUNDLES)("release bundle: $name", ({ name, stub }) => {
  it("contains no code-execution module", () => {
    expect(
      moduleIds[name]?.filter((id) => REAL_CODE_EXEC_MODULES.has(id)),
    ).toStrictEqual([]);
  });

  it.skipIf(stub == null)(
    "substituted the stub rather than dropping the import",
    () => {
      expect(moduleIds[name]).toContain(stub);
    },
  );

  it("does not import node:vm", () => {
    expect(moduleIds[name]).not.toContain("node:vm");
  });
});

/**
 * Bundle one rolldown config in memory and list the modules that went in.
 *
 * @param input - One entry from the rolldown config, output stripped
 * @returns Repo-relative module ids, in bundle order
 */
async function buildModuleIds(input: InputOptions): Promise<string[]> {
  const bundle = await rolldown(input);

  let generated: RolldownOutput;

  try {
    generated = await bundle.generate({ format: "es" });
  } finally {
    await bundle.close();
  }

  return generated.output.flatMap((chunk) =>
    chunk.type === "chunk"
      ? Object.keys(chunk.modules).map((id) =>
          id.startsWith(`${projectRoot}/`)
            ? id.slice(projectRoot.length + 1)
            : id,
        )
      : [],
  );
}
