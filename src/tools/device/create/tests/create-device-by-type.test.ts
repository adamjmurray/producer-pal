// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import { createDevice } from "../create-device.ts";
import { validateInsertionOrder } from "../device-insertion-order.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({ select: vi.fn() }));

describe("createDevice by device type", () => {
  let track: RegisteredMockObject;

  beforeEach(() => {
    track = registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { devices: children("operator", "reverb") },
      methods: { insert_device: () => ["id", "inserted"] },
    });
    registerMockObject("operator", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    });
    registerMockObject("reverb", {
      path: livePath.track(0).device(1),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
    });
    // The insert lands where the Reverb was, which is where the result reads
    // its path from; the registry answers statically, so the Reverb is left
    // where it was rather than shifted to d2.
    registerMockObject("inserted", { path: livePath.track(0).device(1) });
  });

  // "afx0" is the existing Reverb's slot, so the new device lands in front of
  // it — the same as writing the position that segment resolves to.
  it("inserts at the position the type segment resolves to", () => {
    expect(
      createDevice({ path: "t0/afx0", deviceName: "Compressor" }),
    ).toStrictEqual({ id: "inserted", path: "t0/d1" });
    expect(track.call).toHaveBeenCalledWith("insert_device", "Compressor", 1);
  });

  // An entry that names nothing has no target to check the order against, so it
  // is left to the insert loop to report rather than failing the whole list.
  it("skips an entry whose type segment names nothing in the order check", () => {
    registerMockObject("track-1", {
      path: livePath.track(1),
      properties: { devices: children() },
    });

    expect(() =>
      validateInsertionOrder(["t1/inst", "t0/afx0"], "Compressor"),
    ).not.toThrow();
  });

  // The track exists; it is the segment that names nothing, so the error must
  // not blame the container.
  it("refuses an insert at a type segment that names nothing", () => {
    expect(() =>
      createDevice({ path: "t0/afx1", deviceName: "Compressor" }),
    ).toThrow('path "t0/afx1" names no device to insert at');
    expect(track.call).not.toHaveBeenCalled();
  });
});
