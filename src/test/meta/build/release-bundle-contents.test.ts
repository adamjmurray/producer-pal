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

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { rolldown, type InputOptions, type RolldownOutput } from "rolldown";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GEN_UI_REMOTE_SCRIPT_FILES } from "#src/mcp-server/rpc/remote-script/bundle/gen-ui-remote-script-files.ts";
import {
  pluginHostSourceDir,
  readPluginHostSource,
} from "#src/portal/setup/plugin-host/plugin-host-source.ts";
import { projectRoot, repoPath } from "#src/test/helpers/meta-test-helpers.ts";
import {
  DEV_BUILD_MARKER,
  GUARDED_BUILD_FLAGS,
} from "../../../../scripts/build-and-release/helpers/build-flag-guard.ts";
import {
  BUILD_STATS_STUBS,
  CODE_EXEC_STUBS,
} from "../../../../config/rolldown-plugin-stub-modules.mjs";

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
// Where the chat UI is built, so a test run never touches the device's folder:
// one folder per variant (release, hosting, gen UI), since the flags are baked
// in at build time. A build with a flag on must never write to the release one.
let releaseUiDir = "";
let hostingUiDir = "";
let genUiDir = "";

beforeAll(async () => {
  // The config reads these at import time; a shell that happens to export one
  // (the test setup sets ENABLE_WARP_MARKERS) would otherwise turn this suite
  // into a release check of a dev build.
  for (const flag of GUARDED_BUILD_FLAGS) {
    delete process.env[flag];
  }

  scratchDir = mkdtempSync(join(tmpdir(), "ppal-bundle-contents-"));
  releaseUiDir = join(scratchDir, "chat-ui-release");
  hostingUiDir = join(scratchDir, "chat-ui-hosting");
  genUiDir = join(scratchDir, "chat-ui-gen");
  process.env.CHAT_UI_OUT_DIR = releaseUiDir;

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
    `import { EMBEDDED_REMOTE_SCRIPT_FILES } from "#src/mcp-server/rpc/remote-script/bundle/embedded-remote-script.ts";\n` +
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
  delete process.env.CHAT_UI_OUT_DIR;
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

  it("carries no dev-build marker", () => {
    expect(chunkCode[name]).not.toContain(DEV_BUILD_MARKER);
  });

  // Unfinished: a model must not be offered it.
  it("does not offer hosted plug-ins", () => {
    expect(chunkCode[name]).not.toContain("hosted=true");
    expect(chunkCode[name]).not.toContain("inside a Producer Pal wrapper");
  });

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

// The release steps tell a debug device from a release one by this marker, so a
// build with a dev flag on must carry it in every bundle that can end up frozen.
describe("dev build marker", () => {
  const devCode: Record<string, string> = {};

  beforeAll(async () => {
    // The config reads the environment at import time, so load a fresh copy.
    vi.resetModules();
    process.env.ENABLE_LIVE_API = "true";

    try {
      const config = await import("../../../../config/rolldown.config.mjs");
      const configs = config.default as (InputOptions & { output: unknown })[];

      for (const { name, index } of BUNDLES) {
        const built = await buildChunks(configs[index] as InputOptions);

        devCode[name] = built.code;
      }
    } finally {
      delete process.env.ENABLE_LIVE_API;
    }
  }, 120_000);

  it.each(BUNDLES.map((b) => b.name))("is in the %s bundle", (name) => {
    expect(devCode[name]).toContain(`/* ${DEV_BUILD_MARKER} */`);
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

// A release leaves the gen-UI Python out entirely, and a gen-UI build has it.
describe("gen-UI remote script files", () => {
  const embeddedKey = (file: string): string => `"${file}":`;
  let genUiCode = "";

  beforeAll(async () => {
    vi.resetModules();
    process.env.ENABLE_GEN_UI = "true";
    // Its chat UI goes to a scratch folder, not over the release one.
    process.env.CHAT_UI_OUT_DIR = join(scratchDir, "chat-ui-gen-remote-script");

    try {
      const config = await import("../../../../config/rolldown.config.mjs");
      const configs = config.default as (InputOptions & { output: unknown })[];

      const built = await buildChunks(configs[1] as InputOptions);

      genUiCode = built.code;
    } finally {
      delete process.env.ENABLE_GEN_UI;
      process.env.CHAT_UI_OUT_DIR = releaseUiDir;
    }
  }, 120_000);

  it.each(GEN_UI_REMOTE_SCRIPT_FILES)(
    "%s is not in a release build",
    (file) => {
      expect(chunkCode["mcp-server"]).not.toContain(embeddedKey(file));
      expect(portalWithInstaller).not.toContain(embeddedKey(file));
    },
  );

  it.each(GEN_UI_REMOTE_SCRIPT_FILES)("%s is in a gen-UI build", (file) => {
    expect(genUiCode).toContain(embeddedKey(file));
  });

  // The Python files above only prove the bundler dropped them. This proves the
  // gate itself is a constant: a flag read the replacement plugin misses (say
  // `process.env["ENABLE_GEN_UI"]`) would stay a runtime check in the release.
  const CONSTANT_FALSE_GATE =
    /function isGenUiEnabled\(\)\s*\{\s*return false;?\s*\}/;
  const RUNTIME_FLAG_READ = /\benv\s*(?:\?\.|\.|\[\s*["'`])\s*ENABLE_GEN_UI/;

  it("inlines isGenUiEnabled() to false in a release build", () => {
    expect(chunkCode["mcp-server"]).toMatch(CONSTANT_FALSE_GATE);
  });

  it("does not read ENABLE_GEN_UI at runtime in a release build", () => {
    expect(chunkCode["mcp-server"]).not.toMatch(RUNTIME_FLAG_READ);
    expect(chunkCode["mcp-server"]).not.toMatch(
      /ENABLE_GEN_UI[^\n]*=\s*process\.env\b/,
    );
  });

  it("does not inline isGenUiEnabled() to false in a gen-UI build", () => {
    expect(genUiCode).not.toMatch(CONSTANT_FALSE_GATE);
  });
});

// The wrappers ride in the Node bundles only for a hosting build. A release
// carries neither their bytes nor the code that installs them.
describe("plug-in host wrappers", () => {
  const NODE_BUNDLES = ["mcp-server", "portal"] as const;
  // The start of each file, which differs by device type.
  const wrapperBytes = Object.values(
    readPluginHostSource(pluginHostSourceDir(projectRoot)),
  ).map((base64) => base64.slice(0, 200));
  const hostingCode: Record<string, string> = {};

  beforeAll(async () => {
    vi.resetModules();
    process.env.ENABLE_HOSTED_PLUGINS = "true";
    process.env.CHAT_UI_OUT_DIR = hostingUiDir;

    try {
      const config = await import("../../../../config/rolldown.config.mjs");
      const configs = config.default as (InputOptions & { output: unknown })[];

      for (const { name, index } of BUNDLES) {
        if (NODE_BUNDLES.includes(name as "mcp-server" | "portal")) {
          const built = await buildChunks(configs[index] as InputOptions);

          hostingCode[name] = built.code;
        }
      }
    } finally {
      delete process.env.ENABLE_HOSTED_PLUGINS;
      process.env.CHAT_UI_OUT_DIR = releaseUiDir;
    }
  }, 120_000);

  it("finds the wrapper files to look for", () => {
    expect(new Set(wrapperBytes).size).toBe(2);
    expect(wrapperBytes.every((bytes) => bytes.length === 200)).toBe(true);
  });

  it.each(NODE_BUNDLES)("%s: a release build embeds none", (name) => {
    for (const bytes of wrapperBytes) {
      expect(chunkCode[name]).not.toContain(bytes);
    }
  });

  it.each(NODE_BUNDLES)(
    "%s: a release build drops the install code",
    (name) => {
      expect(chunkCode[name]).not.toContain("installPluginHostWrappers");
      // What the status route reads the wrappers with.
      expect(chunkCode[name]).not.toContain("pluginHostStatus");
    },
  );

  it.each(NODE_BUNDLES)("%s: a hosting build embeds both", (name) => {
    for (const bytes of wrapperBytes) {
      expect(hostingCode[name]).toContain(bytes);
    }
  });

  it.each(NODE_BUNDLES)("%s: a hosting build has the install code", (name) => {
    expect(hostingCode[name]).toContain("installPluginHostWrappers");
  });

  it("mcp-server: a hosting build inlines the hosting chat UI", () => {
    expect(hostingCode["mcp-server"]).toContain("Plug-in host devices:");
  });

  it("keeps the bytes out of the V8 bundle, hosting or not", () => {
    for (const bytes of wrapperBytes) {
      expect(chunkCode["live-api-adapter"]).not.toContain(bytes);
    }
  });
});

const readUi = (dir: string): string =>
  readFileSync(join(dir, "chat-ui.html"), "utf-8");

// A release chat UI must carry none of a flagged feature's text or code. The
// device bundle inlines the chat UI, so that is checked too. The UI is
// minified, so a name or a flag read left in it is real code. `variant` names
// the folder holding a build with the flag on.
const FLAGGED_CHAT_UIS = [
  {
    feature: "plug-in host chat UI",
    variant: "hosting",
    text: ["Install the plug-in host devices", "Plug-in host devices:"],
    code: ["ENABLE_HOSTED_PLUGINS", "pluginHost"],
  },
  // Unfinished: a user could otherwise reach it by typing a URL.
  {
    feature: "generative-UI chat panel",
    variant: "gen",
    text: [
      "Generative UI",
      "No widgets yet",
      "gen-app-frame",
      "producer_pal_gen_app_source",
      "Not available in this build",
    ],
    code: ["ENABLE_GEN_UI"],
  },
] as const;

describe.each(FLAGGED_CHAT_UIS)("$feature", ({ variant, text, code }) => {
  const flagDir = (): string => (variant === "gen" ? genUiDir : hostingUiDir);

  // The hosting UI is built by the plug-in host wrappers suite above. Building
  // the device bundle builds the chat UI it inlines.
  beforeAll(async () => {
    if (variant !== "gen") {
      return;
    }

    vi.resetModules();
    process.env.ENABLE_GEN_UI = "true";
    process.env.CHAT_UI_OUT_DIR = genUiDir;

    try {
      const config = await import("../../../../config/rolldown.config.mjs");
      const configs = config.default as (InputOptions & { output: unknown })[];

      await buildChunks(configs[1] as InputOptions);
    } finally {
      delete process.env.ENABLE_GEN_UI;
      process.env.CHAT_UI_OUT_DIR = releaseUiDir;
    }
  }, 120_000);

  it.each([...text, ...code])("a release chat-ui.html has no %s", (str) => {
    expect(readUi(releaseUiDir)).not.toContain(str);
  });

  it.each(text)("the release device bundle has no %s", (str) => {
    expect(chunkCode["mcp-server"]).not.toContain(str);
  });

  // Text only: the flag name itself is replaced by its value in that build.
  it.each(text)("a flagged chat-ui.html has %s", (str) => {
    expect(readUi(flagDir())).toContain(str);
  });
});

it("finds a built chat UI for each variant", () => {
  for (const dir of [releaseUiDir, hostingUiDir, genUiDir]) {
    expect(readUi(dir).length).toBeGreaterThan(1_000_000);
  }
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
        isAbsolute(id) && !repoPath(id).startsWith("..") ? repoPath(id) : id,
      ),
    ),
    code: chunks.map((chunk) => chunk.code).join("\n"),
  };
}
