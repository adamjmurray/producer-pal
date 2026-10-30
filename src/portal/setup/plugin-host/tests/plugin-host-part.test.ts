// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDED_PLUGIN_HOST_WRAPPERS } from "../embedded-plugin-host-wrappers.ts";
import { type PluginHostResult } from "../plugin-host-install.ts";
import {
  describePluginHostParts,
  installPluginHostParts,
  pluginHostPartsOf,
} from "../plugin-host-part.ts";
import {
  PLUGIN_HOST_WRAPPERS,
  pluginHostPath,
} from "../plugin-host-wrappers.ts";

let library: string;

beforeEach(() => {
  library = mkdtempSync(join(tmpdir(), "plugin-host-part-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(library, { recursive: true, force: true });
});

describe("installPluginHostParts", () => {
  it("installs the embedded wrappers and reports each", () => {
    const parts = installPluginHostParts(library);

    expect(
      parts.map((part) => [
        part.name,
        part.ok,
        "status" in part && part.status,
      ]),
    ).toStrictEqual([
      ["PPal Plug-in Effect", undefined, "installed"],
      ["PPal Plug-in Instrument", undefined, "installed"],
    ]);

    for (const wrapper of PLUGIN_HOST_WRAPPERS) {
      expect(
        readFileSync(pluginHostPath(library, wrapper)).toString("base64"),
      ).toBe(EMBEDDED_PLUGIN_HOST_WRAPPERS[wrapper.fileName]);
    }

    expect(
      installPluginHostParts(library).map((p) => "status" in p && p.status),
    ).toStrictEqual(["current", "current"]);
  });

  it("installs nothing without ENABLE_HOSTED_PLUGINS", () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");

    expect(installPluginHostParts(library)).toStrictEqual([]);
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });

  it("reports a wrapper that fails and still installs the other", () => {
    mkdirSync(pluginHostPath(library, PLUGIN_HOST_WRAPPERS[0]), {
      recursive: true,
    });

    const [effect, instrument] = installPluginHostParts(library);

    expect(effect).toStrictEqual(
      expect.objectContaining({ name: "PPal Plug-in Effect", ok: false }),
    );
    expect(instrument).toStrictEqual(
      expect.objectContaining({ status: "installed" }),
    );
  });
});

describe("pluginHostPartsOf", () => {
  const base = { name: "PPal Plug-in Effect", fileName: "x.amxd", path: "/p" };

  it("explains an update, and says nothing about the rest", () => {
    expect(
      pluginHostPartsOf([
        { ...base, outcome: "updated" },
        { ...base, outcome: "installed" },
        { ...base, outcome: "current" },
      ]),
    ).toStrictEqual([
      {
        name: base.name,
        status: "updated",
        path: "/p",
        detail:
          "Replaced the installed wrapper. A Set that's already open keeps the old one until it's reopened.",
      },
      { name: base.name, status: "installed", path: "/p" },
      { name: base.name, status: "current", path: "/p" },
    ]);
  });

  it("tells the user what to do when Live has the file open", () => {
    const failed: PluginHostResult = {
      ...base,
      outcome: "failed",
      error: "EBUSY: resource busy",
      inUse: true,
    };
    const [part] = pluginHostPartsOf([failed]);

    expect(part).toStrictEqual({
      name: base.name,
      ok: false,
      path: "/p",
      detail:
        "Couldn't install the wrapper (EBUSY: resource busy). The wrapper file was not changed. It may be open in Live: close any Set that uses it, or quit Live, then run install-producer-pal again.",
    });
  });

  it("says to try again for any other failure, and names a temp file left", () => {
    const [part] = pluginHostPartsOf([
      {
        ...base,
        outcome: "failed",
        error: "ENOSPC",
        inUse: false,
        tempFileLeft: "/p.tmp-1",
      },
    ]);

    expect(part).toStrictEqual({
      name: base.name,
      ok: false,
      path: "/p",
      detail:
        "Couldn't install the wrapper (ENOSPC). The wrapper file was not changed. Try again: run install-producer-pal again. A temp file couldn't be deleted: /p.tmp-1.",
    });
  });
});

describe("describePluginHostParts", () => {
  it("is empty when the build hosts no plug-ins", () => {
    expect(describePluginHostParts([])).toBe("");
  });

  it("names what became of each wrapper", () => {
    expect(
      describePluginHostParts([
        { name: "A", status: "installed", path: "/a" },
        { name: "B", status: "current", path: "/b" },
        { name: "C", ok: false, path: "/c", detail: "No." },
      ]),
    ).toBe(
      "Plug-in host wrappers: A installed; B already installed; C failed: No.",
    );
  });
});
