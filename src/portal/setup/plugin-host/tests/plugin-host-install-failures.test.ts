// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installPluginHostWrappers,
  pluginHostStatus,
} from "../plugin-host-install.ts";
import { fakeSource } from "./plugin-host-test-helpers.ts";

// Names the effect wrapper's rename to fail, and its temp file's deletion.
const fault = vi.hoisted(() => ({
  rename: undefined as string | undefined,
  remove: false,
}));

vi.mock(
  import("#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      renameInLibrary: (from, to) => {
        if (fault.rename != null && to.includes("Effect")) {
          throw Object.assign(new Error(`${fault.rename}: rename`), {
            code: fault.rename,
          });
        }

        actual.renameInLibrary(from, to);
      },
      removeFromLibrary: (path) => {
        if (fault.remove && path.includes(".tmp-")) {
          throw new Error("EBUSY: rm");
        }

        actual.removeFromLibrary(path);
      },
    };
  },
);

let library: string;

beforeEach(() => {
  fault.rename = undefined;
  fault.remove = false;
  library = mkdtempSync(join(tmpdir(), "plugin-host-failures-"));
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
});

describe("installPluginHostWrappers when the rename fails", () => {
  it("says Live has the file open for a Windows in-use code, and installs the other", () => {
    fault.rename = "EBUSY";

    const [effect, instrument] = installPluginHostWrappers(
      library,
      fakeSource(),
    );

    expect(effect).toStrictEqual({
      name: "PPal Plug-in Effect",
      fileName: "PPal Plug-in Effect.amxd",
      path: expect.stringContaining("PPal Plug-in Effect.amxd") as string,
      outcome: "failed",
      error: "EBUSY: rename",
      inUse: true,
    });
    expect(instrument?.outcome).toBe("installed");
  });

  it("is not in use for any other code, and names a temp file it couldn't delete", () => {
    fault.rename = "ENOSPC";
    fault.remove = true;

    const [effect] = installPluginHostWrappers(library, fakeSource());

    expect(effect).toStrictEqual(
      expect.objectContaining({
        outcome: "failed",
        inUse: false,
        tempFileLeft: expect.stringContaining(".tmp-") as string,
      }),
    );
  });
});

describe("pluginHostStatus when the path can't be read", () => {
  it("says differs when a file sits where a folder belongs", () => {
    mkdirSync(join(library, "Presets"));
    writeFileSync(join(library, "Presets/Audio Effects"), "not a folder");

    expect(
      pluginHostStatus(library, fakeSource()).map((entry) => entry.state),
    ).toStrictEqual(["differs", "missing"]);
  });
});
