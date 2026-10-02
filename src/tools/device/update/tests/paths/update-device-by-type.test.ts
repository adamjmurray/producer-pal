// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  children,
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
  type RegisteredMockObject,
} from "../update-device-test-helpers.ts";

/**
 * Register track 0 holding an audio effect, then optionally an instrument
 * behind it — so the instrument's position and its type index disagree.
 * @param withInstrument - Whether the track holds an instrument at all
 * @returns The devices on the track
 */
function registerTrack(withInstrument: boolean): {
  effect: RegisteredMockObject;
  instrument?: RegisteredMockObject;
} {
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: {
      devices: children(...(withInstrument ? ["afx", "inst"] : ["afx"])),
    },
  });

  const effect = registerMockObject("afx", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
  });

  if (!withInstrument) {
    return { effect };
  }

  return {
    effect,
    instrument: registerMockObject("inst", {
      path: livePath.track(0).device(1),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    }),
  };
}

describe("updateDevice by device type", () => {
  it("writes to the instrument wherever it sits in the chain", () => {
    const { effect, instrument } = registerTrack(true);

    expect(updateDevice({ path: "t0/inst", name: "Renamed" })).toStrictEqual({
      id: "inst",
      path: "t0/d1",
    });
    expect(instrument?.set).toHaveBeenCalledWith("name", "Renamed");
    expect(effect.set).not.toHaveBeenCalled();
  });

  it("writes nothing when the container has no instrument, and says why once", () => {
    // The substituted index is one past the last device, so nothing is there.
    mockNonExistentObjects();

    const { effect } = registerTrack(false);

    // The miss carries its own reason, so there is nothing left to warn about.
    expect(() => updateDevice({ path: "t0/inst", name: "Renamed" })).toThrow(
      'nothing at path "t0/inst": t0 has no instrument',
    );
    expect(capturedWarnings()).toStrictEqual([]);
    expect(effect.set).not.toHaveBeenCalled();
  });

  it("keeps the slot of a listed target whose type segment names nothing", () => {
    mockNonExistentObjects();
    registerTrack(false);

    expect(
      updateDevice({ path: "t0/inst,t0/afx0", name: "Renamed" }),
    ).toStrictEqual([
      {
        path: "t0/inst",
        ok: false,
        detail: 'nothing at path "t0/inst": t0 has no instrument',
      },
      { id: "afx", path: "t0/d0" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
