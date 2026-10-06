// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A release build must not contain the dev-only modules — code execution, or the
// LiveAPI object counter. The stubs are swapped in by a resolveId hook, which is
// easy to break silently: an earlier `resolve.alias` version looked right and
// did nothing for `#src/…` specifiers, so the real module and its stub both
// shipped, each with its own state.
//
// So this builds the release bundles for real and inspects which modules went
// in — the artifact, not the config text.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rolldown, type InputOptions, type RolldownOutput } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

// Stands in for the frozen .amxd. Set before the config loads, as a release
// package would, so a bundler that pulled the device in would carry this text.
const FAKE_DEVICE_TEXT = "FAKE-AMXD-BYTES-4f1c9a";

const moduleIds: Record<string, string[]> = {};
const chunkCode: Record<string, string> = {};
let portalWithInstaller = "";
let bundleCount = 0;
let scratchDir = "";

beforeAll(async () => {
  // The config reads these at import time; a shell that happens to export one
  // would otherwise turn this whole suite into a no-op.
  for (const flag of DEV_ONLY_FLAGS) {
    delete process.env[flag];
  }

  scratchDir = mkdtempSync(join(tmpdir(), "ppal-bundle-contents-"));

  const fakeDevice = join(scratchDir, "Producer_Pal.amxd");

  writeFileSync(fakeDevice, FAKE_DEVICE_TEXT);
  process.env.PRODUCER_PAL_DEVICE_FILE = fakeDevice;

  const config = await import("../../../../config/rolldown.config.mjs");
  const configs = config.default as (InputOptions & { output: unknown })[];

  bundleCount = configs.length;

  for (const { name, index } of BUNDLES) {
    const built = await buildChunks(configs[index] as InputOptions);

    moduleIds[name] = built.ids;
    chunkCode[name] = built.code;
  }

  // The portal doesn't import the installer yet, and a module nothing imports
  // is never loaded, so the real portal build can't show whether the embedding
  // plugin is wired in. Build the portal's own config around an entry that does.
  const probeEntry = join(scratchDir, "probe-entry.ts");

  writeFileSync(
    probeEntry,
    `import { EMBEDDED_REMOTE_SCRIPT_FILES } from "#src/mcp-server/rpc/remote-script/embedded-remote-script.ts";\n` +
      "console.log(EMBEDDED_REMOTE_SCRIPT_FILES);\n",
  );

  const probed = await buildChunks({
    ...(configs[2] as InputOptions),
    input: probeEntry,
  });

  portalWithInstaller = probed.code;
}, 120_000);

afterAll(() => {
  delete process.env.PRODUCER_PAL_DEVICE_FILE;
  rmSync(scratchDir, { recursive: true, force: true });
});

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

  // The frozen device ships beside the portal as a file. Importing it would put
  // 10 MB in the bundle, and in the device's own bundle the .amxd would contain
  // itself.
  it("does not contain the frozen device", () => {
    expect(moduleIds[name]?.filter((id) => id.endsWith(".amxd"))).toStrictEqual(
      [],
    );
    expect(chunkCode[name]).not.toContain(FAKE_DEVICE_TEXT);
  });
});

describe("remote script embedding", () => {
  // Remote-script files are flat in the embedded map: a literal key per file.
  const EMBEDDED_KEY = '"bridge.py":';

  it("is in the device bundle", () => {
    expect(chunkCode["mcp-server"]).toContain(EMBEDDED_KEY);
  });

  it("is in the portal bundle once the portal imports the installer", () => {
    expect(portalWithInstaller).toContain(EMBEDDED_KEY);
  });

  it("does not read remote-script/ from disk at runtime", () => {
    expect(portalWithInstaller).not.toContain("readRemoteScriptSource");
  });
});

/**
 * Bundle one rolldown config in memory.
 *
 * @param input - One entry from the rolldown config, output stripped
 * @returns The modules that went in (repo-relative, bundle order) and the generated code
 */
async function buildChunks(
  input: InputOptions,
): Promise<{ ids: string[]; code: string }> {
  const bundle = await rolldown(input);

  let generated: RolldownOutput;

  try {
    generated = await bundle.generate({ format: "es" });
  } finally {
    await bundle.close();
  }

  const chunks = generated.output.filter((out) => out.type === "chunk");

  return {
    ids: chunks.flatMap((chunk) =>
      Object.keys(chunk.modules).map((id) =>
        id.startsWith(`${projectRoot}/`)
          ? id.slice(projectRoot.length + 1)
          : id,
      ),
    ),
    code: chunks.map((chunk) => chunk.code).join("\n"),
  };
}
