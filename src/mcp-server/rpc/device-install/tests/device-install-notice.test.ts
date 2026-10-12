// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  readGlobalSettings,
  updateGlobalSettings,
} from "../../../helpers/config-store/global-settings-store.ts";
import {
  dismissInstallNotice,
  shouldShowInstallNotice,
  syncDeviceInstallNotice,
} from "../device-install-notice.ts";
import {
  type DeviceInstallStatus,
  deviceInstallStatus,
} from "../device-install-status.ts";

vi.mock(import("../device-install-status.ts"), () => ({
  deviceInstallStatus: vi.fn(),
  checkDeviceSource: vi.fn(),
}));

vi.mock(
  import("../../../helpers/config-store/global-settings-store.ts"),
  () => ({
    updateGlobalSettings: vi.fn(),
    readGlobalSettings: vi.fn(),
    DEFAULT_GLOBAL_SETTINGS: {
      autoUpdateCheck: true,
      dismissedUpdateVersion: null,
      dismissedInstallVersion: null,
    },
  }),
);

/**
 * @param overrides - Fields to change
 * @returns A status for a frozen device that isn't in the User Library
 */
function status(
  overrides: Partial<DeviceInstallStatus> = {},
): DeviceInstallStatus {
  return {
    source: "/Users/me/Downloads/Producer_Pal.amxd",
    problem: null,
    userLibrary: "/Users/me/Music/Ableton/User Library",
    inUserLibrary: false,
    path: "/Users/me/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd",
    state: "not-installed",
    version: VERSION,
    installedVersion: null,
    otherCopies: [],
    ...overrides,
  };
}

/**
 * @param dismissedInstallVersion - The version the settings say was dismissed
 * @returns A full settings object
 */
function settings(dismissedInstallVersion: string | null = null) {
  return {
    autoUpdateCheck: true,
    dismissedUpdateVersion: null,
    dismissedInstallVersion,
  };
}

describe("shouldShowInstallNotice", () => {
  it.each([
    { state: "not-installed" as const, show: true },
    { state: "installed-older" as const, show: true },
    { state: "same" as const, show: false },
    { state: "installed-newer" as const, show: false },
    { state: "different" as const, show: false },
  ])("is $show for a $state copy", ({ state, show }) => {
    expect(shouldShowInstallNotice(status({ state }), null)).toBe(show);
  });

  it.each([
    "unknown-source" as const,
    "unreadable-source" as const,
    "not-frozen" as const,
    "no-user-library" as const,
  ])("never shows for %s", (problem) => {
    expect(
      shouldShowInstallNotice(status({ problem, state: null }), null),
    ).toBe(false);
  });

  it("stays hidden once this version was dismissed, but not another", () => {
    expect(shouldShowInstallNotice(status(), VERSION)).toBe(false);
    expect(shouldShowInstallNotice(status(), "0.0.1")).toBe(true);
  });
});

describe("syncDeviceInstallNotice", () => {
  beforeEach(() => {
    vi.mocked(Max.outlet).mockClear();
    vi.mocked(Max.post).mockClear();
    vi.mocked(deviceInstallStatus).mockReset();
    vi.mocked(readGlobalSettings).mockReset().mockReturnValue(settings());
  });

  it("shows the notice for a missing copy", async () => {
    vi.mocked(deviceInstallStatus).mockResolvedValue(status());

    await syncDeviceInstallNotice();

    expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
      "config",
      "installNotice",
      1,
    );
  });

  it("hides the notice once the copy is current", async () => {
    vi.mocked(deviceInstallStatus).mockResolvedValue(status({ state: "same" }));

    await syncDeviceInstallNotice();

    expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
      "config",
      "installNotice",
      0,
    );
  });

  it("hides the notice after a dismissal of this version", async () => {
    vi.mocked(deviceInstallStatus).mockResolvedValue(status());
    vi.mocked(readGlobalSettings).mockReturnValue(settings(VERSION));

    await syncDeviceInstallNotice();

    expect(Max.outlet).toHaveBeenCalledWith("config", "installNotice", 0);
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

describe("dismissInstallNotice", () => {
  beforeEach(() => {
    vi.mocked(Max.outlet).mockClear();
    vi.mocked(Max.post).mockClear();
    vi.mocked(updateGlobalSettings).mockReset();
    vi.mocked(deviceInstallStatus).mockReset().mockResolvedValue(status());
  });

  it("saves this version, then hides the notice", async () => {
    // Once saved, the real settings carry the dismissal.
    vi.mocked(readGlobalSettings).mockReturnValue(settings(VERSION));

    await dismissInstallNotice();

    expect(updateGlobalSettings).toHaveBeenCalledExactlyOnceWith({
      dismissedInstallVersion: VERSION,
    });
    expect(Max.outlet).toHaveBeenCalledWith("config", "installNotice", 0);
  });

  it("keeps the notice and warns when the setting can't be saved", async () => {
    vi.mocked(updateGlobalSettings).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    await dismissInstallNotice();

    expect(Max.outlet).not.toHaveBeenCalled();
    expect(Max.post).toHaveBeenCalledWith(
      expect.stringContaining("EACCES: permission denied"),
      "warn",
    );
  });

  it("keeps the notice when the save silently did nothing", async () => {
    // The settings store drops writes when the config dir is disabled.
    vi.mocked(readGlobalSettings).mockReturnValue(settings());

    await dismissInstallNotice();

    expect(Max.outlet).toHaveBeenCalledWith("config", "installNotice", 1);
  });
});
