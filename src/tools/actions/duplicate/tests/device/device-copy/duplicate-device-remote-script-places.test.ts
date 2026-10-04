// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where a device copy made by the remote script can come from and go: return
// and main tracks, drum chains (where `c0` and `pC1` name one chain), and
// several sources in one call.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  registerMockObject,
  registerPendingMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { registerLayeredDrumRack } from "#src/tools/device/tests/helpers/device-rack-fixtures.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

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

/**
 * Have the remote script copy each device to the next index.
 * @param index - Where Live puts the copy
 */
function remoteScriptCopiesTo(index: number): void {
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: { available: true, index },
  });
}

/**
 * An audio effect, with a copy of it just after.
 * @param idPrefix - Names the two mocks
 * @param container - The track or chain holding them
 * @param index - The original's index
 * @param container.device - Builds a device path in the container
 */
function registerEffectWithCopy(
  idPrefix: string,
  container: { device: (index: number) => unknown },
  index: number,
): void {
  for (const [id, at] of [
    [idPrefix, index],
    [`${idPrefix}-copy`, index + 1],
  ] as const) {
    registerMockObject(id, {
      path: String(container.device(at)),
      properties: { name: "Delay", type: 2, class_name: "Delay" },
    });
  }
}

describe("duplicate device - through the remote script, from anywhere", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMockObject("live_set", { path: livePath.liveSet });
  });

  it("copies a device on a return track", async () => {
    registerMockObject("return0", {
      path: livePath.returnTrack(0),
      properties: { devices: children("fx", "fx-copy") },
    });
    registerEffectWithCopy("fx", livePath.returnTrack(0), 0);
    remoteScriptCopiesTo(1);

    expect(await duplicate({ type: "device", id: "fx" })).toStrictEqual({
      id: "fx-copy",
      path: "rt0/d1",
    });
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.duplicateDevice,
      expect.objectContaining({
        devicePath: "live_set return_tracks 0 devices 0",
      }),
      expect.any(Number),
    );
  });

  it("copies a device on the main track", async () => {
    registerMockObject("master", {
      path: livePath.masterTrack(),
      properties: { devices: children("fx", "fx-copy") },
    });
    registerEffectWithCopy("fx", livePath.masterTrack(), 0);
    remoteScriptCopiesTo(1);

    expect(await duplicate({ type: "device", id: "fx" })).toStrictEqual({
      id: "fx-copy",
      path: "mt/d1",
    });
  });

  it("makes every copy of a call through the route", async () => {
    for (const track of [0, 1]) {
      registerMockObject(`track${track}`, {
        path: livePath.track(track),
        properties: { devices: children(`fx${track}`, `fx${track}-copy`) },
      });
      registerEffectWithCopy(`fx${track}`, livePath.track(track), 0);
    }

    remoteScriptCopiesTo(1);

    expect(await duplicate({ type: "device", id: "fx0,fx1" })).toStrictEqual([
      { id: "fx0-copy", path: "t0/d1" },
      { id: "fx1-copy", path: "t1/d1" },
    ]);
    expect(
      vi.mocked(requestNode).mock.calls.map((call) => call[1]),
    ).toStrictEqual([
      expect.objectContaining({ devicePath: "live_set tracks 0 devices 0" }),
      expect.objectContaining({ devicePath: "live_set tracks 1 devices 0" }),
    ]);
  });
});

describe("duplicate device - from a drum chain", () => {
  const CHAIN_0 = livePath.track(0).device(0).chain(0);

  beforeEach(() => {
    vi.clearAllMocks();
    registerMockObject("live_set", { path: livePath.liveSet });
    // Pad C1 holds chains 0 and 2, pad D1 chain 1.
    registerLayeredDrumRack({
      rackProperties: { class_name: "DrumGroupDevice", return_chains: [] },
      chainProperties: (index) =>
        index === 0 ? { devices: children("src", "src-copy") } : {},
    });
    registerEffectWithCopy("src", CHAIN_0, 0);
    remoteScriptCopiesTo(1);
  });

  it("copies it where Live put it when no destination is given", async () => {
    await duplicate({ type: "device", id: "src" });

    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.duplicateDevice,
      expect.objectContaining({
        devicePath: String(CHAIN_0.device(0)),
      }),
      expect.any(Number),
    );
    expect(moveDeviceToPathMock).not.toHaveBeenCalled();
  });

  it("moves the copy to another pad's chain", async () => {
    await duplicate({ type: "device", id: "src", toPath: "t0/d0/pD1/d0" });

    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({ _path: String(CHAIN_0.device(1)) }),
      "t0/d0/pD1/d0",
      expect.anything(),
      "t0/d0/pD1/d0",
    );
  });

  it.each([
    ["another layer of the same pad", "t0/d0/pC1/c1/d0"],
    ["a new layer", "t0/d0/pC1/c+"],
  ])("moves the copy to %s", async (_label, toPath) => {
    await duplicate({ type: "device", id: "src", toPath });

    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(moveDeviceToPathMock).toHaveBeenCalledTimes(1);
  });

  // `c0` and `pC1` name one chain, so a string comparison would call the
  // destination another container and trust an index Live may count two ways.
  it.each(["t0/d0/pC1/d3", "t0/d0/pC1/d+", "t0/d0/pC1", "t0/d0/c0/d0"])(
    "uses the temp track for %s, the same chain spelled another way",
    async (toPath) => {
      const liveSet = registerMockObject("live_set", {
        path: livePath.liveSet,
      });

      registerPendingMockObject("temp-src", {
        path: livePath.track(1).device(0).chain(0).device(0),
      });
      await duplicate({ type: "device", id: "src", toPath });

      expect(requestNode).not.toHaveBeenCalled();
      expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
    },
  );
});
