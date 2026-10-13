// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { readGlobalSettings } from "../../../helpers/config-store/global-settings-store.ts";
import { getUpdate } from "../../../helpers/http/update-check.ts";
import { syncDeviceInstallNotice } from "../device-install-notice.ts";
import {
  type DeviceInstallStatus,
  deviceInstallStatus,
} from "../device-install-status.ts";
import { installIncomplete } from "../install-incomplete.ts";

vi.mock(import("../device-install-status.ts"), () => ({
  deviceInstallStatus: vi.fn(),
  checkDeviceSource: vi.fn(),
}));

vi.mock(import("../install-incomplete.ts"), () => ({
  installIncomplete: vi.fn(),
}));

vi.mock(import("../../../helpers/http/update-check.ts"), () => ({
  getUpdate: vi.fn(),
}));

vi.mock(
  import("../../../helpers/config-store/global-settings-store.ts"),
  () => ({
    updateGlobalSettings: vi.fn(),
    readGlobalSettings: vi.fn(),
    DEFAULT_GLOBAL_SETTINGS: {
      autoUpdateCheck: true,
      dismissedUpdateVersion: null,
      warnIfInstallIncomplete: true,
    },
  }),
);

const STATUS: DeviceInstallStatus = {
  source: "/Users/me/Downloads/Producer_Pal.amxd",
  problem: null,
  userLibrary: "/Users/me/Music/Ableton/User Library",
  path: null,
  inUserLibrary: false,
  state: "not-installed",
  version: VERSION,
  installedVersion: null,
  otherCopies: [],
};

/**
 * @param warnIfInstallIncomplete - Whether the user wants the warning
 * @returns A full settings object
 */
function settings(warnIfInstallIncomplete = true) {
  return {
    autoUpdateCheck: true,
    dismissedUpdateVersion: null,
    warnIfInstallIncomplete,
  };
}

describe("syncDeviceInstallNotice", () => {
  beforeEach(() => {
    vi.mocked(Max.outlet).mockClear();
    vi.mocked(Max.post).mockClear();
    vi.mocked(deviceInstallStatus).mockReset().mockResolvedValue(STATUS);
    vi.mocked(installIncomplete).mockReset().mockReturnValue(true);
    vi.mocked(getUpdate).mockReset().mockResolvedValue(null);
    vi.mocked(readGlobalSettings).mockReset().mockReturnValue(settings());
  });

  it("shows the notice for an incomplete installation", async () => {
    await syncDeviceInstallNotice();

    expect(installIncomplete).toHaveBeenCalledWith(STATUS);
    expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
      "config",
      "installNotice",
      1,
    );
  });

  it("hides the notice once the installation is complete", async () => {
    vi.mocked(installIncomplete).mockReturnValue(false);

    await syncDeviceInstallNotice();

    expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
      "config",
      "installNotice",
      0,
    );
  });

  it("hides the notice when the user turned the warning off, without looking further", async () => {
    vi.mocked(readGlobalSettings).mockReturnValue(settings(false));

    await syncDeviceInstallNotice();

    expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
      "config",
      "installNotice",
      0,
    );
    expect(deviceInstallStatus).not.toHaveBeenCalled();
    expect(getUpdate).not.toHaveBeenCalled();
  });

  it("gives way to the update notice, which sits in the same spot", async () => {
    vi.mocked(getUpdate).mockResolvedValue({ version: "9.9.9" });

    await syncDeviceInstallNotice();

    expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
      "config",
      "installNotice",
      0,
    );
  });

  it("leaves the notice alone, and warns, when the state can't be read", async () => {
    vi.mocked(deviceInstallStatus).mockRejectedValue(new Error("EIO: read"));

    await expect(syncDeviceInstallNotice()).resolves.toBeUndefined();

    expect(Max.outlet).not.toHaveBeenCalled();
    expect(Max.post).toHaveBeenCalledWith(
      expect.stringContaining("EIO: read"),
      "warn",
    );
  });
});
