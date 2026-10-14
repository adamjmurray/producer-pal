// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { UserLibraryFolderError } from "../../remote-script/user-library/user-library-folder.ts";
import { deviceInstallStatus } from "../device-install-status.ts";
import { recordDeviceSource } from "../device-source.ts";
import {
  developmentDevice,
  frozenDevice,
  useDeviceScratch,
} from "./device-install-test-helpers.ts";

const { findUserLibraryPath } = vi.hoisted(() => ({
  findUserLibraryPath: vi.fn<() => Promise<string | null>>(),
}));

vi.mock(import("../../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath,
}));

describe("deviceInstallStatus", () => {
  const scratch = useDeviceScratch();

  beforeEach(() => {
    findUserLibraryPath.mockReset();
    vi.mocked(Max.outlet).mockClear();
  });

  it("says a frozen device isn't installed yet", async () => {
    const { library, runFromDownloads, installed } = scratch();
    const source = runFromDownloads(frozenDevice(VERSION));

    findUserLibraryPath.mockResolvedValue(library);

    expect(await deviceInstallStatus()).toStrictEqual({
      source,
      problem: null,
      userLibrary: library,
      path: installed,
      inUserLibrary: false,
      state: "not-installed",
      version: VERSION,
      installedVersion: null,
      otherCopies: [],
    });
  });

  it("compares with the installed copy and lists other copies", async () => {
    const { library, runFromDownloads, installed, put } = scratch();
    const other = join(library, "Presets", "Producer_Pal 2.amxd");

    runFromDownloads(frozenDevice(VERSION));
    put(installed, frozenDevice("0.0.1"));
    put(other, frozenDevice("0.0.1"));
    findUserLibraryPath.mockResolvedValue(library);

    const status = await deviceInstallStatus();

    expect(status).toStrictEqual(
      expect.objectContaining({
        problem: null,
        state: "installed-older",
        installedVersion: "0.0.1",
        otherCopies: [other],
      }),
    );
  });

  it("uses the User Library it's given instead of looking", async () => {
    const { library, runFromDownloads } = scratch();

    runFromDownloads(frozenDevice(VERSION));

    const status = await deviceInstallStatus(`  ${library}  `);

    expect(status.userLibrary).toBe(library);
    expect(findUserLibraryPath).not.toHaveBeenCalled();
  });

  it("rejects a given User Library that isn't a folder", async () => {
    const { library, runFromDownloads } = scratch();

    runFromDownloads(frozenDevice(VERSION));

    await expect(
      deviceInstallStatus(join(library, "nope")),
    ).rejects.toBeInstanceOf(UserLibraryFolderError);
  });

  it("reports a development device and compares nothing", async () => {
    const { library, runFromDownloads } = scratch();

    runFromDownloads(developmentDevice());
    findUserLibraryPath.mockResolvedValue(library);

    expect(await deviceInstallStatus()).toStrictEqual(
      expect.objectContaining({
        problem: "not-frozen",
        userLibrary: library,
        path: null,
        state: null,
      }),
    );
  });

  it("reports a device file that can't be read", async () => {
    const { library, downloads } = scratch();
    const missing = join(downloads, "gone.amxd");

    recordDeviceSource(missing);
    findUserLibraryPath.mockResolvedValue(library);

    expect(await deviceInstallStatus()).toStrictEqual(
      expect.objectContaining({
        source: missing,
        problem: "unreadable-source",
        state: null,
      }),
    );
  });

  it("asks the device to report when it hasn't yet", async () => {
    const { library } = scratch();

    findUserLibraryPath.mockResolvedValue(library);

    expect(await deviceInstallStatus()).toStrictEqual(
      expect.objectContaining({
        source: null,
        problem: "unknown-source",
        userLibrary: library,
      }),
    );
    expect(Max.outlet).toHaveBeenCalledWith("config", "reportDevice", 1);
  });

  it("reports a missing User Library", async () => {
    const { runFromDownloads } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    findUserLibraryPath.mockResolvedValue(null);

    expect(await deviceInstallStatus()).toStrictEqual(
      expect.objectContaining({
        problem: "no-user-library",
        userLibrary: null,
        path: null,
        state: null,
      }),
    );
  });
});
