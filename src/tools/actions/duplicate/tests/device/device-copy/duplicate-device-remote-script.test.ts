// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// With the remote script, Live copies a device itself: the copy appears right
// after the original, and is moved on only when the caller asked for elsewhere.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
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

const SOURCE_PATH = livePath.track(0).device(1);
const COPY_PATH = livePath.track(0).device(2);

/**
 * A Reverb on track 0 at d1, with the copy Live will make right after it.
 * @param type - The source's Live device type (2 is an audio effect)
 * @returns The track and the source device
 */
function registerReverbWithCopy(type = 2): {
  track: RegisteredMockObject;
  source: RegisteredMockObject;
  copy: RegisteredMockObject;
} {
  const track = registerMockObject("track0", {
    path: livePath.track(0),
    properties: { devices: children("eq", "reverb", "after") },
  });
  const source = registerMockObject("reverb", {
    path: SOURCE_PATH,
    properties: { name: "Reverb", type },
  });

  const copy = registerMockObject("reverb-copy", {
    path: COPY_PATH,
    properties: { name: "Reverb", type },
  });

  registerMockObject("live_set", { path: livePath.liveSet });

  return { track, source, copy };
}

/**
 * Make the remote script copy the device to `index`.
 * @param index - Where Live put the copy
 */
function remoteScriptCopiesTo(index: number): void {
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: { available: true, index },
  });
}

describe("duplicate device - through the remote script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remoteScriptCopiesTo(2);
  });

  it("leaves the copy where Live put it when no destination is given", async () => {
    registerReverbWithCopy();
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    expect(await duplicate({ type: "device", id: "reverb" })).toStrictEqual({
      id: "reverb-copy",
      path: "t0/d2",
    });
    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.duplicateDevice,
      {
        devicePath: String(SOURCE_PATH),
        deviceName: "Reverb",
        expiresInMs: expect.any(Number),
      },
      expect.any(Number),
    );
    expect(moveDeviceToPathMock).not.toHaveBeenCalled();
    expect(liveSet.call).not.toHaveBeenCalledWith(
      "duplicate_track",
      expect.anything(),
    );
  });

  it("doesn't move a copy whose destination is the spot Live chose", async () => {
    registerReverbWithCopy();

    await duplicate({ type: "device", id: "reverb", toPath: "t0/d2" });

    expect(moveDeviceToPathMock).not.toHaveBeenCalled();
  });

  it("moves the copy to a destination in another container", async () => {
    registerReverbWithCopy();

    const result = await duplicate({
      type: "device",
      id: "reverb",
      toPath: "t1/d0",
    });

    expect(result).toHaveProperty("id", "reverb-copy");
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({ _path: String(COPY_PATH) }),
      "t1/d0",
      expect.objectContaining({ _id: "reverb" }),
      "t1/d0",
    );
  });

  it("says which chains the move made", async () => {
    registerReverbWithCopy();
    vi.mocked(moveDeviceToPathMock).mockReturnValueOnce({
      outcome: "moved",
      created: "c1-c2",
    });

    expect(
      await duplicate({ type: "device", id: "reverb", toPath: "t1/d0/c2/d+" }),
    ).toHaveProperty("created", "c1-c2");
  });

  it("names the copy", async () => {
    const { copy } = registerReverbWithCopy();

    await duplicate({ type: "device", id: "reverb", name: "Big Hall" });

    expect(copy.set).toHaveBeenCalledWith("name", "Big Hall");
  });

  it("keeps the copy and says so when its name won't take", async () => {
    const { copy } = registerReverbWithCopy();

    copy.set.mockImplementation(() => {
      throw new Error("read-only");
    });

    const result = await duplicate({
      type: "device",
      id: "reverb",
      name: "Big Hall",
    });

    expect(result).toHaveProperty("id", "reverb-copy");
    expect(result).toHaveProperty(
      "detail",
      "the device was copied, but naming it failed: read-only",
    );
  });

  it("copies a device inside a rack chain", async () => {
    registerReverbWithCopy();
    const chain = livePath.track(0).device(0).chain(1);

    registerMockObject("rack-chain", {
      path: chain,
      properties: { devices: children("delay") },
    });
    registerMockObject("delay", {
      path: chain.device(0),
      properties: { name: "Delay", type: 2 },
    });
    registerMockObject("delay-copy", {
      path: chain.device(1),
      properties: { name: "Delay", type: 2 },
    });
    remoteScriptCopiesTo(1);

    expect(await duplicate({ type: "device", id: "delay" })).toStrictEqual({
      id: "delay-copy",
      path: "t0/d0/c1/d1",
    });
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.duplicateDevice,
      expect.objectContaining({ devicePath: String(chain.device(0)) }),
      expect.any(Number),
    );
  });
});

describe("duplicate device - when the remote script can't do it", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remoteScriptCopiesTo(2);
  });

  /**
   * Check the call went through the temp track.
   * @param liveSet - The Live Set mock
   */
  function expectTempTrackRoute(liveSet: RegisteredMockObject): void {
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  }

  it("falls back to the temp track when no remote script answers", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });
    const { source } = registerReverbWithCopy();
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    registerMockObject("temp-copy", {
      path: livePath.track(1).device(1),
    });
    await duplicate({ type: "device", id: "reverb" });

    expect(source.call).not.toHaveBeenCalled();
    expectTempTrackRoute(liveSet);
  });

  it("goes straight to the temp track for an instrument, which Live refuses", async () => {
    registerReverbWithCopy(LIVE_API_DEVICE_TYPE_INSTRUMENT);
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    registerMockObject("temp-copy", { path: livePath.track(1).device(1) });
    await duplicate({ type: "device", id: "reverb" });

    expect(requestNode).not.toHaveBeenCalled();
    expectTempTrackRoute(liveSet);
  });

  it.each([
    ["another spot in the same chain", "t0/d0"],
    ["the end of the same chain", "t0/d+"],
    ["a rack beside it", "t0/d2/c0/d0"],
  ])(
    "goes to the temp track for %s, where an index could mean two things",
    async (_label, toPath) => {
      registerReverbWithCopy();
      const liveSet = registerMockObject("live_set", {
        path: livePath.liveSet,
      });

      registerMockObject("temp-copy", { path: livePath.track(1).device(1) });
      await duplicate({ type: "device", id: "reverb", toPath });

      expect(requestNode).not.toHaveBeenCalled();
      expectTempTrackRoute(liveSet);
    },
  );
});
