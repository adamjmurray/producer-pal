// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_REPORT_ROUTE } from "#src/shared/max/device-install-contract.ts";
import {
  clearNodeRoutes,
  handleNodeRequest,
} from "../../node-request-protocol.ts";
import {
  dispatchNodeRoute,
  parseSentNodeResponse,
} from "../../../tests/config-dir-test-helpers.ts";
import { registerDeviceReportRoute } from "../device-report-route.ts";
import { syncDeviceInstallNotice } from "../device-install-notice.ts";
import { deviceSourcePath, resetDeviceSource } from "../device-source.ts";

vi.mock(import("../device-install-notice.ts"), () => ({
  syncDeviceInstallNotice: vi.fn(async () => {}),
}));

describe("device.report route", () => {
  beforeEach(() => {
    clearNodeRoutes();
    resetDeviceSource();
    registerDeviceReportRoute();
    vi.mocked(Max.outlet).mockClear();
    vi.mocked(syncDeviceInstallNotice).mockClear();
  });

  it("remembers the device's file and settles the notice", async () => {
    const response = await dispatchNodeRoute(DEVICE_REPORT_ROUTE, {
      filepath: "No Such Volume:/Devices/Producer_Pal.amxd",
    });

    expect(response).toStrictEqual({
      success: true,
      result: { recorded: true },
    });
    expect(deviceSourcePath()).toBe(
      "/Volumes/No Such Volume/Devices/Producer_Pal.amxd",
    );
    expect(syncDeviceInstallNotice).toHaveBeenCalledTimes(1);
  });

  it("ignores a path that isn't one, without touching the notice", async () => {
    const response = await dispatchNodeRoute(DEVICE_REPORT_ROUTE, {
      filepath: "nonsense",
    });

    expect(response).toStrictEqual({
      success: true,
      result: { recorded: false },
    });
    expect(deviceSourcePath()).toBeNull();
    expect(syncDeviceInstallNotice).not.toHaveBeenCalled();
  });

  it("answers an error when the path is missing", async () => {
    await handleNodeRequest(
      "id",
      JSON.stringify({ route: DEVICE_REPORT_ROUTE, args: {} }),
    );

    expect(parseSentNodeResponse()).toStrictEqual({
      success: false,
      error: "filepath must be a string",
    });
  });
});
