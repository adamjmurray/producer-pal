// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { installRemoteScript } from "../../remote-script/install/remote-script-install.ts";
import { UserLibraryFolderError } from "../../remote-script/user-library/user-library-folder.ts";
import {
  installRunningDevice,
  type RunningDeviceInstall,
} from "../device-install.ts";
import { recordDeviceSource } from "../device-source.ts";
import {
  developmentDevice,
  frozenDevice,
  useDeviceScratch,
} from "./device-install-test-helpers.ts";
import { findUserLibraryPath } from "../../../live-library/query/user-library-path.ts";

vi.mock(import("../../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath: vi.fn(),
}));

// The real check would ask GitHub.
vi.mock(import("../../../helpers/http/update-check.ts"), () => ({
  getUpdate: vi.fn(async () => null),
}));

// Names a user-library-fs call to fail.
const fault = vi.hoisted(() => ({
  // Leave a partial temp file, then fail the copy.
  copy: false,
  rename: false,
  // Reads of the running device that still work before they start failing.
  readsLeft: undefined as number | undefined,
}));

vi.mock(
  import("../../remote-script/user-library/user-library-fs.ts"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      readLibraryBytes: (file) => {
        if (
          fault.readsLeft != null &&
          file.includes("Downloads") &&
          fault.readsLeft-- <= 0
        ) {
          throw new Error("EIO: read");
        }

        return actual.readLibraryBytes(file);
      },
      copyIntoLibrary: (from, to) => {
        actual.copyIntoLibrary(from, to);

        if (fault.copy) {
          throw Object.assign(new Error("ENOSPC: copy"), { code: "ENOSPC" });
        }
      },
      renameInLibrary: (from, to) => {
        if (fault.rename) {
          throw Object.assign(new Error("EBUSY: rename"), { code: "EBUSY" });
        }

        actual.renameInLibrary(from, to);
      },
    };
  },
);

/**
 * @param install - What installRunningDevice returned
 * @returns The parts of it that say how it went
 */
function summarize(install: RunningDeviceInstall): {
  status: string;
  outcome: string | undefined;
  changed: boolean | undefined;
} {
  return {
    status: install.status,
    outcome: install.result?.outcome,
    changed: install.result?.changed,
  };
}

/** A failed install that changed nothing, as summarize() reads it. */
const FAILED = { status: "failed", outcome: "failed", changed: false };

describe("installRunningDevice", () => {
  const scratch = useDeviceScratch();

  beforeEach(() => {
    fault.copy = false;
    fault.rename = false;
    fault.readsLeft = undefined;
    vi.mocked(findUserLibraryPath).mockReset();
    vi.mocked(Max.outlet).mockClear();
  });

  it("copies a frozen device into the User Library and hides the notice", async () => {
    const { library, runFromDownloads, installed } = scratch();
    const bytes = frozenDevice(VERSION);

    vi.mocked(findUserLibraryPath).mockResolvedValue(library);
    installRemoteScript(library);
    runFromDownloads(bytes);

    const result = installRunningDevice(library);

    expect(summarize(result)).toStrictEqual({
      status: "done",
      outcome: "installed",
      changed: true,
    });
    expect(readFileSync(installed).equals(bytes)).toBe(true);
    await vi.waitFor(() => {
      expect(Max.outlet).toHaveBeenCalledWith("config", "installNotice", 0);
    });
  });

  it("keeps the notice up after the copy while the remote script is still missing", async () => {
    const { library, runFromDownloads } = scratch();

    vi.mocked(findUserLibraryPath).mockResolvedValue(library);
    runFromDownloads(frozenDevice(VERSION));
    installRunningDevice(library);

    await vi.waitFor(() => {
      expect(Max.outlet).toHaveBeenCalledWith("config", "installNotice", 1);
    });
  });

  it("makes the Presets folders when the library has none", () => {
    const { library, runFromDownloads, installed } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    installRunningDevice(library);

    expect(existsSync(dirname(installed))).toBe(true);
  });

  it("updates an older copy", () => {
    const { library, runFromDownloads, installed, put } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    put(installed, frozenDevice("0.0.1"));

    const result = installRunningDevice(library);

    expect(summarize(result)).toStrictEqual({
      status: "done",
      outcome: "updated",
      changed: true,
    });
    expect(result.result?.previousVersion).toBe("0.0.1");
  });

  it("says so when the copy is already this one", () => {
    const { library, runFromDownloads, installed, put } = scratch();
    const bytes = frozenDevice(VERSION);

    runFromDownloads(bytes);
    put(installed, bytes);

    const result = installRunningDevice(library);

    expect(summarize(result)).toStrictEqual({
      status: "done",
      outcome: "current",
      changed: false,
    });
    expect(result.result?.detail).toBe(
      "The installed device is already this one.",
    );
  });

  it("refuses to replace a newer copy without force, and leaves it", () => {
    const { library, runFromDownloads, installed, put } = scratch();
    const newer = frozenDevice("999.0.0");

    runFromDownloads(frozenDevice(VERSION));
    put(installed, newer);

    const result = installRunningDevice(library);

    expect(summarize(result)).toStrictEqual({
      status: "refused",
      outcome: "skipped",
      changed: false,
    });
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("is newer than this one ("),
    );
    expect(readFileSync(installed).equals(newer)).toBe(true);
    expect(Max.outlet).not.toHaveBeenCalled();
  });

  it("replaces a newer copy with force", () => {
    const { library, runFromDownloads, installed, put } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    put(installed, frozenDevice("999.0.0"));

    expect(summarize(installRunningDevice(library, true))).toStrictEqual({
      status: "done",
      outcome: "updated",
      changed: true,
    });
  });

  it("refuses a development device and changes nothing", () => {
    const { library, runFromDownloads, installed } = scratch();

    runFromDownloads(developmentDevice());

    expect(installRunningDevice(library)).toStrictEqual({
      status: "refused",
      error: expect.stringContaining("Freeze it first"),
    });
    expect(existsSync(installed)).toBe(false);
  });

  it("refuses while the device hasn't said where it is", () => {
    const { library } = scratch();

    expect(installRunningDevice(library)).toStrictEqual({
      status: "refused",
      error: expect.stringContaining("hasn't said where"),
    });
  });

  it("refuses a device file that can't be read", () => {
    const { library, downloads } = scratch();

    recordDeviceSource(join(downloads, "gone.amxd"));

    expect(installRunningDevice(library)).toStrictEqual({
      status: "refused",
      error: expect.stringContaining("can't be read"),
    });
  });

  it("throws for a User Library that isn't a folder, before anything changes", () => {
    const { library, runFromDownloads } = scratch();

    runFromDownloads(frozenDevice(VERSION));

    expect(() => installRunningDevice(join(library, "nope"))).toThrow(
      UserLibraryFolderError,
    );
  });

  it("fails without changing anything when the device file vanishes mid-install", () => {
    const { library, runFromDownloads, installed } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    // The frozen check reads it once; the install's own read then fails.
    fault.readsLeft = 1;

    expect(installRunningDevice(library)).toStrictEqual({
      status: "failed",
      error: expect.stringContaining("EIO: read"),
    });
    expect(existsSync(installed)).toBe(false);
  });

  it("fails and leaves the old copy when the copy dies halfway", () => {
    const { library, runFromDownloads, installed, put } = scratch();
    const old = frozenDevice("0.0.1");

    runFromDownloads(frozenDevice(VERSION));
    put(installed, old);
    fault.copy = true;

    const result = installRunningDevice(library);

    expect(summarize(result)).toStrictEqual(FAILED);
    expect(result).toHaveProperty("error", expect.stringContaining("ENOSPC"));
    expect(readFileSync(installed).equals(old)).toBe(true);
    // The half-written temp file is gone.
    expect(readdirSync(dirname(installed))).toStrictEqual([
      "Producer_Pal.amxd",
    ]);
    expect(Max.outlet).not.toHaveBeenCalled();
  });

  it("fails, names the folders it made, and keeps the notice when the swap is refused", () => {
    const { library, runFromDownloads, installed } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    fault.rename = true;

    const result = installRunningDevice(library);

    expect(summarize(result)).toStrictEqual(FAILED);
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("may be open in Live"),
    );
    expect(existsSync(installed)).toBe(false);
    expect(Max.outlet).not.toHaveBeenCalled();
  });
});
