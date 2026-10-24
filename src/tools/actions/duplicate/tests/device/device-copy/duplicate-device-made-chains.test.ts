// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device copy whose destination made rack chains reports them, and names
// them when the copy then can't land.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { setupDeviceDuplicationMocks } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { remoteScriptDown } from "#src/tools/actions/duplicate/helpers/device/remote-script-down-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn(),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { moveDeviceToPath } from "#src/tools/device/update/helpers/move-device.ts";

describe("duplicate - a device copy to a destination that makes chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remoteScriptDown();
    setupDeviceDuplicationMocks();
  });

  it("reports the chains the destination made on the copy's entry", async () => {
    vi.mocked(moveDeviceToPath).mockReturnValueOnce({
      outcome: "moved",
      created: "c1-c2",
    });

    expect(
      await duplicate({ type: "device", id: "device1", toPath: "t2/d0/c2/d+" }),
    ).toStrictEqual({
      id: "live_set/tracks/1/devices/0",
      path: "t1/d0",
      created: "c1-c2",
    });
  });

  it("names the chains when Live then refuses the copy", async () => {
    vi.mocked(moveDeviceToPath).mockReturnValueOnce({
      outcome: "refused",
      madeChains: "c1-c2",
    });

    await expect(
      duplicate({ type: "device", id: "device1", toPath: "t2/d0/c2/d+" }),
    ).rejects.toThrow(
      'the copy of t0/d0 (id device1) could not be moved to "t2/d0/c2/d+"; left 2 empty chains: c1-c2',
    );
  });

  it("names them when the destination has no container after all", async () => {
    vi.mocked(moveDeviceToPath).mockReturnValueOnce({
      outcome: "no-destination",
      madeChains: "c0",
    });

    await expect(
      duplicate({ type: "device", id: "device1", toPath: "t2/d0/c+" }),
    ).rejects.toThrow(
      'not copied — no destination at toPath "t2/d0/c+"; left an empty chain: c0',
    );
  });
});
