// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateGlobalSettings } from "../../helpers/config-store/global-settings-store.ts";
import { getUpdate } from "../../helpers/http/update-check.ts";
import {
  dismissUpdate,
  syncDeviceUpdateNotice,
} from "../../helpers/http/update-dismissal.ts";

vi.mock(import("../../helpers/http/update-check.ts"), () => ({
  getUpdate: vi.fn(),
}));

vi.mock(import("../../helpers/config-store/global-settings-store.ts"), () => ({
  updateGlobalSettings: vi.fn(),
  readGlobalSettings: vi.fn(),
  DEFAULT_GLOBAL_SETTINGS: {
    autoUpdateCheck: true,
    dismissedUpdateVersion: null,
  },
}));

const HIDE_NOTICE = ["config", "updateDismissed", 1];

describe("dismissUpdate", () => {
  beforeEach(() => {
    vi.mocked(Max.outlet).mockClear();
    vi.mocked(Max.post).mockClear();
    vi.mocked(updateGlobalSettings).mockReset();
  });

  it("saves the dismissed version, then hides the device notice", async () => {
    // Once saved, the real getUpdate stops returning the version.
    vi.mocked(getUpdate)
      .mockResolvedValueOnce({ version: "9.9.9" })
      .mockResolvedValueOnce(null);

    await dismissUpdate();

    expect(updateGlobalSettings).toHaveBeenCalledWith({
      dismissedUpdateVersion: "9.9.9",
    });
    expect(Max.outlet).toHaveBeenCalledWith(...HIDE_NOTICE);
  });

  it("keeps the notice and warns when the setting can't be saved", async () => {
    vi.mocked(getUpdate).mockResolvedValue({ version: "9.9.9" });
    vi.mocked(updateGlobalSettings).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    await dismissUpdate();

    expect(Max.outlet).not.toHaveBeenCalled();
    expect(Max.post).toHaveBeenCalledWith(
      expect.stringContaining("EACCES: permission denied"),
      "warn",
    );
  });

  it("keeps the notice when the save silently did nothing", async () => {
    // The settings store drops writes when the config dir is disabled.
    vi.mocked(getUpdate).mockResolvedValue({ version: "9.9.9" });
    vi.mocked(updateGlobalSettings).mockReturnValue({
      autoUpdateCheck: true,
      dismissedUpdateVersion: null,
    });

    await dismissUpdate();

    expect(updateGlobalSettings).toHaveBeenCalledTimes(1);
    expect(Max.outlet).not.toHaveBeenCalled();
  });

  it("just hides the notice when there is nothing left to dismiss", async () => {
    vi.mocked(getUpdate).mockResolvedValue(null);

    await dismissUpdate();

    expect(updateGlobalSettings).not.toHaveBeenCalled();
    expect(Max.outlet).toHaveBeenCalledWith(...HIDE_NOTICE);
  });
});

describe("syncDeviceUpdateNotice", () => {
  beforeEach(() => {
    vi.mocked(Max.outlet).mockClear();
  });

  it("hides the device notice when no update is left to show", async () => {
    vi.mocked(getUpdate).mockResolvedValue(null);

    await syncDeviceUpdateNotice();

    expect(Max.outlet).toHaveBeenCalledWith(...HIDE_NOTICE);
  });

  it("leaves the device notice alone while an update is showing", async () => {
    vi.mocked(getUpdate).mockResolvedValue({ version: "9.9.9" });

    await syncDeviceUpdateNotice();

    expect(Max.outlet).not.toHaveBeenCalled();
  });
});
