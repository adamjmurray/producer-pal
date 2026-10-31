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
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installPluginHostWrappers,
  pluginHostStatus,
} from "../plugin-host-install.ts";
import { PLUGIN_HOST_WRAPPERS } from "../plugin-host-wrappers.ts";
import { EFFECT, INSTRUMENT, fakeSource } from "./plugin-host-test-helpers.ts";

let library: string;

beforeEach(() => {
  library = mkdtempSync(join(tmpdir(), "plugin-host-install-"));
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
});

const effectPath = (): string =>
  join(library, "Presets/Audio Effects/Max Audio Effect", EFFECT);
const instrumentPath = (): string =>
  join(library, "Presets/Instruments/Max Instrument", INSTRUMENT);

describe("installPluginHostWrappers", () => {
  it("creates the folders and installs both wrappers", () => {
    const results = installPluginHostWrappers(library, fakeSource());

    expect(results).toStrictEqual([
      {
        name: "PPal Plug-in Effect",
        fileName: EFFECT,
        path: effectPath(),
        outcome: "installed",
      },
      {
        name: "PPal Plug-in Instrument",
        fileName: INSTRUMENT,
        path: instrumentPath(),
        outcome: "installed",
      },
    ]);
    expect(readFileSync(effectPath(), "utf8")).toBe(`v1 ${EFFECT}`);
    expect(readFileSync(instrumentPath(), "utf8")).toBe(`v1 ${INSTRUMENT}`);
  });

  it("reports an identical wrapper as current and leaves it alone", () => {
    installPluginHostWrappers(library, fakeSource());

    const results = installPluginHostWrappers(library, fakeSource());

    expect(results.map((r) => r.outcome)).toStrictEqual(["current", "current"]);
  });

  it("replaces a wrapper that differs, by bytes alone, leaving no temp file", () => {
    installPluginHostWrappers(library, fakeSource());

    const next = {
      ...fakeSource(),
      [EFFECT]: Buffer.from("v2").toString("base64"),
    };
    const results = installPluginHostWrappers(library, next);

    expect(results.map((r) => r.outcome)).toStrictEqual(["updated", "current"]);
    expect(readFileSync(effectPath(), "utf8")).toBe("v2");
    expect(readdirSync(dirname(effectPath()))).toStrictEqual([EFFECT]);
  });

  it("removes a stale temp file an earlier install left", () => {
    const folder = dirname(effectPath());
    const stale = join(
      folder,
      `${EFFECT}.tmp-11111111-2222-3333-4444-555555555555`,
    );

    mkdirSync(folder, { recursive: true });
    writeFileSync(stale, "half");

    const longAgo = new Date(Date.now() - 3_600_000);

    utimesSync(stale, longAgo, longAgo);
    installPluginHostWrappers(library, fakeSource());

    expect(existsSync(stale)).toBe(false);
  });

  it("fails one wrapper without stopping the other", () => {
    // A folder where the file belongs can't be read or replaced as a file.
    mkdirSync(effectPath(), { recursive: true });

    const results = installPluginHostWrappers(library, fakeSource());

    expect(results[0]).toStrictEqual({
      name: "PPal Plug-in Effect",
      fileName: EFFECT,
      path: effectPath(),
      outcome: "failed",
      error: expect.stringContaining("EISDIR") as string,
      inUse: false,
    });
    expect(results[1]?.outcome).toBe("installed");
    expect(existsSync(instrumentPath())).toBe(true);
  });

  it("fails a wrapper the source lacks, and installs the other", () => {
    const source = fakeSource();

    delete source[INSTRUMENT];

    const results = installPluginHostWrappers(library, source);

    expect(results[1]).toStrictEqual({
      name: "PPal Plug-in Instrument",
      fileName: INSTRUMENT,
      path: instrumentPath(),
      outcome: "failed",
      error: "this build doesn't include it",
      inUse: false,
    });
    expect(results[0]?.outcome).toBe("installed");
    expect(existsSync(instrumentPath())).toBe(false);
  });

  it("fails a wrapper whose folder can't be made, keeping what is there", () => {
    // A file where a folder belongs stops the mkdir.
    mkdirSync(join(library, "Presets"));
    writeFileSync(join(library, "Presets/Audio Effects"), "not a folder");

    const [effect, instrument] = installPluginHostWrappers(
      library,
      fakeSource(),
    );

    expect(effect?.outcome).toBe("failed");
    expect(instrument?.outcome).toBe("installed");
  });
});

describe("pluginHostStatus", () => {
  it("says missing, current or differs, changing nothing", () => {
    installPluginHostWrappers(library, fakeSource());
    writeFileSync(instrumentPath(), "something else");
    rmSync(effectPath());

    expect(pluginHostStatus(library, fakeSource())).toStrictEqual([
      { name: "PPal Plug-in Effect", path: effectPath(), state: "missing" },
      {
        name: "PPal Plug-in Instrument",
        path: instrumentPath(),
        state: "differs",
      },
    ]);
    expect(existsSync(effectPath())).toBe(false);
    expect(readFileSync(instrumentPath(), "utf8")).toBe("something else");
  });

  it("says current for identical bytes", () => {
    installPluginHostWrappers(library, fakeSource());

    expect(
      pluginHostStatus(library, fakeSource()).map((s) => s.state),
    ).toStrictEqual(["current", "current"]);
  });

  it("says differs when the source lacks the wrapper or the path is a folder", () => {
    installPluginHostWrappers(library, fakeSource());
    rmSync(effectPath());
    mkdirSync(effectPath());

    expect(pluginHostStatus(library, {}).map((s) => s.state)).toStrictEqual([
      "differs",
      "differs",
    ]);
  });

  it("covers every wrapper in the table", () => {
    expect(pluginHostStatus(library, {})).toHaveLength(
      PLUGIN_HOST_WRAPPERS.length,
    );
  });
});
