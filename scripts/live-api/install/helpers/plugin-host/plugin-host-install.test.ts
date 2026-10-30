// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLUGIN_HOST_WRAPPERS,
  describePluginHostInstall,
  installPluginHostWrappers,
  pluginHostSourcePath,
} from "./plugin-host-install.ts";

const EFFECT = "PPal Plug-in Effect.amxd";
const INSTRUMENT = "PPal Plug-in Instrument.amxd";

let root: string;
let library: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "plugin-host-install-"));
  library = join(root, "lib");
  mkdirSync(library);
  mkdirSync(join(root, "max-for-live-device/plugin-host"), { recursive: true });

  for (const { fileName } of PLUGIN_HOST_WRAPPERS) {
    writeFileSync(pluginHostSourcePath(root, fileName), `v1 ${fileName}`);
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const effectPath = (): string =>
  join(library, "Presets/Audio Effects/Max Audio Effect", EFFECT);
const instrumentPath = (): string =>
  join(library, "Presets/Instruments/Max Instrument", INSTRUMENT);

describe("installPluginHostWrappers", () => {
  it("creates the folders and installs both wrappers", () => {
    const results = installPluginHostWrappers(library, root);

    expect(results).toStrictEqual([
      { fileName: EFFECT, path: effectPath(), outcome: "installed" },
      { fileName: INSTRUMENT, path: instrumentPath(), outcome: "installed" },
    ]);
    expect(readFileSync(effectPath(), "utf8")).toBe(`v1 ${EFFECT}`);
    expect(readFileSync(instrumentPath(), "utf8")).toBe(`v1 ${INSTRUMENT}`);
  });

  it("reports an identical wrapper as current and leaves it alone", () => {
    installPluginHostWrappers(library, root);

    const results = installPluginHostWrappers(library, root);

    expect(results.map((r) => r.outcome)).toStrictEqual(["current", "current"]);
  });

  it("replaces a wrapper that differs and leaves no temp file", () => {
    installPluginHostWrappers(library, root);
    writeFileSync(pluginHostSourcePath(root, EFFECT), "v2");

    const results = installPluginHostWrappers(library, root);

    expect(results.map((r) => r.outcome)).toStrictEqual(["updated", "current"]);
    expect(readFileSync(effectPath(), "utf8")).toBe("v2");
    expect(readdirSync(join(effectPath(), ".."))).toStrictEqual([EFFECT]);
  });

  it("fails one wrapper without stopping the other", () => {
    // A folder where the file belongs can't be read or replaced as a file.
    mkdirSync(effectPath(), { recursive: true });

    const results = installPluginHostWrappers(library, root);

    expect(results[0]).toStrictEqual({
      fileName: EFFECT,
      path: effectPath(),
      outcome: "failed",
      error: expect.stringContaining("EISDIR") as string,
    });
    expect(results[1]?.outcome).toBe("installed");
    expect(existsSync(instrumentPath())).toBe(true);
  });

  it("throws before changing anything when a source file is missing", () => {
    rmSync(pluginHostSourcePath(root, INSTRUMENT));

    expect(() => installPluginHostWrappers(library, root)).toThrow(
      /PPal Plug-in Instrument\.amxd not found/,
    );
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });
});

describe("describePluginHostInstall", () => {
  it("prints one line per wrapper", () => {
    const { lines, ok } = describePluginHostInstall([
      { fileName: EFFECT, path: "/a", outcome: "installed" },
      { fileName: INSTRUMENT, path: "/b", outcome: "current" },
    ]);

    expect(lines).toStrictEqual(["installed: /a", "already current: /b"]);
    expect(ok).toBe(true);
  });

  it("notes that an open Set keeps the old wrapper after an update", () => {
    const { lines } = describePluginHostInstall([
      { fileName: EFFECT, path: "/a", outcome: "updated" },
    ]);

    expect(lines).toStrictEqual([
      "updated: /a",
      "A Set that's already open keeps the old wrapper until it's reopened.",
    ]);
  });

  it("is not ok when a wrapper failed", () => {
    const { lines, ok } = describePluginHostInstall([
      { fileName: EFFECT, path: "/a", outcome: "failed", error: "EACCES" },
    ]);

    expect(lines).toStrictEqual(["failed: /a (EACCES)"]);
    expect(ok).toBe(false);
  });
});
