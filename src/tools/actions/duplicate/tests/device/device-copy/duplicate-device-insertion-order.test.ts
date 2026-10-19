// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A copy renumbers the chain it lands in, so a later toPath spelled through
// that chain is refused before anything is copied. The rule is create-device's;
// see insertion-order.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_DEVICE_TYPE_AUDIO_EFFECT } from "#src/tools/constants.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerMockObject,
  registerPendingMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { remoteScriptDown } from "#src/tools/actions/duplicate/helpers/device/remote-script-down-test-helpers.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn((): DeviceMove => ({ outcome: "moved" })),
}));

import {
  type DeviceMove,
  moveDeviceToPath,
} from "#src/tools/device/update/helpers/move-device.ts";

describe("duplicate device - a toPath list an earlier copy renumbers", () => {
  let liveSet: RegisteredMockObject;

  // The source is an audio effect on t0. t2: a rack, then a Utility.
  beforeEach(() => {
    remoteScriptDown();
    registerMockObject("device1", {
      path: livePath.track(0).device(1),
      type: "PluginDevice",
      properties: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
    });
    liveSet = registerMockObject("live_set", { path: livePath.liveSet });
    registerPendingMockObject("live_set/tracks/1/devices/1", {
      path: livePath.track(1).device(1),
    });
    registerMockObject("track-2", {
      path: livePath.track(2),
      type: "Track",
      properties: { devices: children("rack", "util") },
    });
    registerMockObject("rack-c0", {
      path: livePath.track(2).device(0).chain(0),
      type: "Chain",
      properties: { devices: children() },
    });
    registerMockObject("rack", {
      path: livePath.track(2).device(0),
      type: "RackDevice",
      properties: { chains: children("rack-c0"), can_have_chains: 1 },
    });
  });

  it.each([
    [
      "a rack in the chain an earlier copy inserted into",
      "t2/d0,t2/d0/c0",
      'toPath entry "t2/d0/c0" is spelled through "t2", which the copy to "t2/d0" renumbers.',
    ],
    [
      "a second slot in one chain",
      "t2/d0,t2/d1",
      'toPath entry "t2/d1" is spelled through "t2", which the copy to "t2/d0" renumbers.',
    ],
    [
      "a second slot in one chain, the higher first",
      "t2/d1,t2/d0",
      'toPath entry "t2/d0" is spelled through "t2", which the copy to "t2/d1" renumbers.',
    ],
  ])("refuses %s, copying nothing", async (_case, toPath, reason) => {
    await expect(
      duplicate({ type: "device", id: "device1", toPath }),
    ).rejects.toThrow(`${reason} Make these calls separately.`);
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(moveDeviceToPath).not.toHaveBeenCalled();
  });

  it.each([
    ["a rack before an appended audio effect", "t2/d+,t2/d0/c0"],
    ["the same chain twice", "t2/d0/c0,t2/d0/c0"],
  ])("lets %s through", async (_case, toPath) => {
    await duplicate({ type: "device", id: "device1", toPath });

    expect(moveDeviceToPath).toHaveBeenCalledTimes(2);
  });

  // A copy to nowhere fails on its turn, so it renumbers nothing.
  it.each(["t9/d0,t9/d0", "t2/d5/c0,t2/d0"])(
    "reads past a copy to nowhere (%s)",
    async (toPath) => {
      mockNonExistentObjects();

      await expect(
        duplicate({ type: "device", id: "device1", toPath }),
      ).resolves.toBeDefined();
    },
  );
});
