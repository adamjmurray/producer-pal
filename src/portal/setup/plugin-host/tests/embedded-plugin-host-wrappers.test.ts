// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";
import { WRAPPER_NAMES } from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import {
  embedPluginHost,
  readWrapperSource,
} from "../../../../../config/rolldown-plugin-embed-plugin-host.mjs";
import {
  pluginHostSourceDir,
  readPluginHostSource,
} from "../plugin-host-source.ts";
import { PLUGIN_HOST_WRAPPERS } from "../plugin-host-wrappers.ts";

const EMBEDDED_MODULE = join(
  projectRoot,
  "src/portal/setup/plugin-host/embedded-plugin-host-wrappers.ts",
);

let scratch: string;

const byName = (a: string, b: string): number => a.localeCompare(b);

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "ppal-plugin-host-source-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  rmSync(scratch, { recursive: true, force: true });
});

describe("the wrapper table", () => {
  it("names the wrappers Live's browser and the tools know", () => {
    expect(PLUGIN_HOST_WRAPPERS.map(({ name }) => name)).toStrictEqual([
      WRAPPER_NAMES.effect,
      WRAPPER_NAMES.instrument,
    ]);
    expect(PLUGIN_HOST_WRAPPERS.map(({ fileName }) => fileName)).toStrictEqual(
      PLUGIN_HOST_WRAPPERS.map(({ name }) => `${name}.amxd`),
    );
  });

  it("matches the files in the repo", () => {
    expect(
      Object.keys(
        readPluginHostSource(pluginHostSourceDir(projectRoot)),
      ).toSorted(byName),
    ).toStrictEqual(
      PLUGIN_HOST_WRAPPERS.map(({ fileName }) => fileName).toSorted(byName),
    );
  });
});

describe("the embedded module", () => {
  it("reads the repo's wrappers with ENABLE_HOSTED_PLUGINS", async () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "true");
    vi.resetModules();

    const { EMBEDDED_PLUGIN_HOST_WRAPPERS } =
      await import("../embedded-plugin-host-wrappers.ts");

    expect(EMBEDDED_PLUGIN_HOST_WRAPPERS).toStrictEqual(
      readPluginHostSource(pluginHostSourceDir(projectRoot)),
    );
  });

  it.each(["", "1", "false"])("is empty when the flag is %j", async (value) => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", value);
    vi.resetModules();

    const { EMBEDDED_PLUGIN_HOST_WRAPPERS } =
      await import("../embedded-plugin-host-wrappers.ts");

    expect(EMBEDDED_PLUGIN_HOST_WRAPPERS).toStrictEqual({});
  });
});

describe("the readers", () => {
  it("take only .amxd files, and the build plugin's agrees with the source's", () => {
    writeFileSync(join(scratch, "a.amxd"), "device");
    writeFileSync(join(scratch, "._a.amxd"), "appledouble");
    writeFileSync(join(scratch, "wrapper.js"), "code");
    writeFileSync(join(scratch, ".DS_Store"), "junk");

    const expected = { "a.amxd": Buffer.from("device").toString("base64") };

    expect(readPluginHostSource(scratch)).toStrictEqual(expected);
    expect(readWrapperSource(scratch)).toStrictEqual(expected);
  });
});

describe("the embed plugin", () => {
  /** @returns The map the plugin would embed with this environment */
  function embedded(): Record<string, string> {
    const code = String(embedPluginHost().load(EMBEDDED_MODULE));
    const json = code.slice(code.indexOf("{"), code.lastIndexOf("}") + 1);

    return JSON.parse(json) as Record<string, string>;
  }

  it("embeds the repo's wrappers with ENABLE_HOSTED_PLUGINS=true", () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "true");

    expect(embedded()).toStrictEqual(
      readPluginHostSource(pluginHostSourceDir(projectRoot)),
    );
  });

  it.each(["", "1", "false"])("embeds nothing when the flag is %j", (value) => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", value);

    expect(embedded()).toStrictEqual({});
  });

  it("leaves every other module alone", () => {
    expect(
      embedPluginHost().load(join(projectRoot, "src/other.ts")),
    ).toBeUndefined();
  });

  it("watches the files it embeds, and names the module if it is renamed", () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "true");

    const watched: string[] = [];

    embedPluginHost().buildStart.call({
      addWatchFile: (file: string) => watched.push(file),
    });

    expect(
      watched.map((file) => file.split("/").pop() ?? "").toSorted(byName),
    ).toStrictEqual(
      PLUGIN_HOST_WRAPPERS.map(({ fileName }) => fileName).toSorted(byName),
    );
  });
});
