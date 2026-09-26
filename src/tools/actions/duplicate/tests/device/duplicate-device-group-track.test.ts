// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerTrackCopySet } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn((): DeviceMove => ({ outcome: "moved" })),
}));

import {
  type DeviceMove,
  moveDeviceToPath as moveDeviceToPathMock,
} from "#src/tools/device/update/helpers/move-device.ts";

describe("duplicate - device on a group track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves the device off the group's copy and deletes that copy", async () => {
    // t0 is a group holding t1 and t2; t3 comes after. The copy lands at t3,
    // its members at t4 and t5, so the old t3 is now t6.
    const { liveSet } = registerTrackCopySet(["group", "m1", "m2", "after"], {
      index: 0,
      members: 2,
    });

    registerMockObject("fx", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
    });
    registerMockObject("fx-copy", { path: livePath.track(3).device(0) });

    const result = await duplicate({ type: "device", id: "fx", toPath: "t3" });

    expect(result).toStrictEqual({ id: "fx-copy", path: "t3/d0" });
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({ _path: String(livePath.track(3).device(0)) }),
      "t6",
      expect.anything(),
      "t3",
    );
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 3);
    expect(liveSet.call).not.toHaveBeenCalledWith("delete_track", 1);
  });

  it("leaves a destination on one of the group's own members where it was", async () => {
    registerTrackCopySet(["group", "m1", "after"], { index: 0, members: 1 });
    registerMockObject("fx", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
    });

    await duplicate({ type: "device", id: "fx", toPath: "t1" });

    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({ _path: String(livePath.track(2).device(0)) }),
      "t1",
      expect.anything(),
      "t1",
    );
  });
});
