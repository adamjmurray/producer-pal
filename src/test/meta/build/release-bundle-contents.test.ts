// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A release build must not contain the dev-only modules — code execution, or the
// LiveAPI object counter. The stubs are swapped in by a resolveId hook, which is
// easy to break silently: an earlier `resolve.alias` version looked right and
// did nothing for `#src/…` specifiers, so the real module and its stub both
// shipped, each with its own state.
//
// So this builds the release bundles for real and inspects which modules went
// in — the artifact, not the config text.

import { rolldown, type InputOptions, type RolldownOutput } from "rolldown";
import { beforeAll, describe, expect, it } from "vitest";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";
import {
  BUILD_STATS_STUBS,
  CODE_EXEC_STUBS,
} from "../../../../config/rolldown-plugin-stub-modules.mjs";

/** The flags whose absence puts a stub in each real module's place. */
const DEV_ONLY_FLAGS = ["ENABLE_CODE_EXEC", "ENABLE_BUILD_STATS"];

// Taken from the plugin's own tables rather than restated. A restated path that
// went stale in a rename would filter for something that can never appear, and
// the absence check would pass by matching nothing — the failure this file
// exists to catch, since the historic bug shipped the real module AND its stub.
const STUB_TABLE: Record<string, string> = {
  ...CODE_EXEC_STUBS,
  ...BUILD_STATS_STUBS,
};

/** Modules that must never reach a build without those flags. */
const REAL_DEV_ONLY_MODULES = new Set(Object.keys(STUB_TABLE));

// Absence alone would also pass if the import were simply deleted, so each
// bundle names the stubs that have to be standing in their place. The portal
// reaches none of these modules today, so it names none — it is covered because
// it ships, and an import added later must arrive stubbed.
const BUNDLES = [
  {
    name: "live-api-adapter",
    index: 0,
    stubs: [
      "src/tools/clip/code-exec/code-exec-v8-protocol-disabled.ts",
      "src/live-api-adapter/live-api-build-stats-disabled.ts",
    ],
  },
  {
    name: "mcp-server",
    index: 1,
    stubs: ["src/tools/clip/code-exec/code-exec-protocol-disabled.ts"],
  },
  { name: "portal", index: 2, stubs: [] },
] as const;

const moduleIds: Record<string, string[]> = {};
let bundleCount = 0;

beforeAll(async () => {
  // The config reads these at import time; a shell that happens to export one
  // would otherwise turn this whole suite into a no-op.
  for (const flag of DEV_ONLY_FLAGS) {
    delete process.env[flag];
  }

  const config = await import("../../../../config/rolldown.config.mjs");
  const configs = config.default as (InputOptions & { output: unknown })[];

  bundleCount = configs.length;

  for (const { name, index } of BUNDLES) {
    moduleIds[name] = await buildModuleIds(configs[index] as InputOptions);
  }
}, 120_000);

// BUNDLES addresses the configs by index, so a fourth one appended to the
// rolldown config would ship unchecked by anything here.
it("checks every bundle the build produces", () => {
  expect(bundleCount).toBe(BUNDLES.length);
});

// The per-bundle lists say WHICH stub belongs in WHICH bundle, which the tables
// don't record — but a name that no table declares is a typo, not an assertion.
it("names only stubs the substitution tables declare", () => {
  const declared = Object.values(STUB_TABLE);

  for (const { stubs } of BUNDLES) {
    for (const stub of stubs) {
      expect(declared).toContain(stub);
    }
  }
});

describe.each(BUNDLES)("release bundle: $name", ({ name, stubs }) => {
  it("contains no dev-only module", () => {
    expect(
      moduleIds[name]?.filter((id) => REAL_DEV_ONLY_MODULES.has(id)),
    ).toStrictEqual([]);
  });

  it.skipIf(stubs.length === 0)(
    "substituted the stubs rather than dropping the imports",
    () => {
      for (const stub of stubs) {
        expect(moduleIds[name]).toContain(stub);
      }
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
