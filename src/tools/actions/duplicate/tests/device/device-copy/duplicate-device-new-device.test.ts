// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `d+` as a copy destination: put the copy at the end of that container.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { setupDeviceDuplicationMocks } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn((): DeviceMove => ({ outcome: "moved" })),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import {
  type DeviceMove,
  moveDeviceToPath as moveDeviceToPathMock,
} from "#src/tools/device/update/helpers/move-device.ts";

describe("duplicate type=device — d+ as a destination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the copy to the end of the destination track", async () => {
    setupDeviceDuplicationMocks(1);

    const result = await duplicate({
      type: "device",
      id: "device1",
      toPath: "t2/d+",
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/devices/1",
      path: "t1/d1",
    });
    // The temp track sits before t2, so the move is aimed a track along — and
    // the "d+" rides through that adjustment like any other segment.
    expect(vi.mocked(moveDeviceToPathMock).mock.calls[0]?.[1]).toBe("t3/d+");
  });
});
