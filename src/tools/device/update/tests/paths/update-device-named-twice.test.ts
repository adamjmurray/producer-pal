// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One object named twice is one target: the last mention writes, and each
// earlier one says so in its own entry (ADR-0058).

import { describe, expect, it } from "vitest";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  type RegisteredMockObject,
  children,
  keepsParamValue,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

/**
 * Register track 0 holding an audio effect, then an instrument.
 * @returns The effect and the instrument
 */
function registerEffectAndInstrument(): {
  effect: RegisteredMockObject;
  instrument: RegisteredMockObject;
} {
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children("afx", "inst") },
  });

  return {
    effect: registerMockObject("afx", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
    }),
    instrument: registerMockObject("inst", {
      path: livePath.track(0).device(1),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    }),
  };
}

describe("updateDevice - a device named twice", () => {
  it("writes the device named by id and by path once, at the last mention", () => {
    const device = registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
    });

    const result = updateDevice({ id: "123", path: "t0/d0", name: "A,B" });

    expect(device.set).toHaveBeenCalledTimes(1);
    expect(device.set).toHaveBeenCalledWith("name", "B");
    expect(result).toStrictEqual([
      { id: "123", detail: 'named again as "t0/d0" later in this call' },
      { id: "123", path: "t0/d0" },
    ]);
  });

  it("matches a device named by its type and by its position", () => {
    const { effect, instrument } = registerEffectAndInstrument();

    const result = updateDevice({
      path: "t0/inst,t0/d1,t0/afx0",
      name: "A,B,C",
    });

    expect(instrument.set).toHaveBeenCalledTimes(1);
    expect(instrument.set).toHaveBeenCalledWith("name", "B");
    expect(effect.set).toHaveBeenCalledWith("name", "C");
    expect(result).toStrictEqual([
      { path: "t0/inst", detail: 'named again as "t0/d1" later in this call' },
      { id: "inst", path: "t0/d1" },
      { id: "afx", path: "t0/d0" },
    ]);
  });

  it("matches a chain named by its pad and by its rack position", () => {
    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_drum_pads: 1,
        chains: children("chain-0"),
        drum_pads: children("pad-36"),
      },
    });
    registerMockObject("pad-36", { type: "DrumPad", properties: { note: 36 } });
    registerMockObject("volume", {
      path: `${livePath.track(0).device(0).chain(0)} mixer_device volume`,
      type: "DeviceParameter",
      properties: { display_value: 0 },
    });
    const chain = registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36 },
    });

    const result = updateDevice({ path: "t0/d0/pC1/c0,t0/d0/c0", mute: true });

    expect(chain.set).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual([
      {
        path: "t0/d0/pC1/c0",
        detail: 'named again as "t0/d0/c0" later in this call',
      },
      { id: "chain-0", path: "t0/d0/pC1/c0" },
    ]);
  });

  it("matches a drum pad named by its id and by its path", () => {
    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_drum_pads: 1,
        chains: children("chain-0"),
        drum_pads: children("pad-36"),
      },
    });
    const pad = registerMockObject("pad-36", {
      type: "DrumPad",
      properties: { note: 36 },
    });
    const volume = registerMockObject("volume", {
      path: `${livePath.track(0).device(0).chain(0)} mixer_device volume`,
      type: "DeviceParameter",
      properties: { display_value: 0 },
    });

    keepsParamValue(volume, -6.02);
    registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36 },
    });

    const result = updateDevice({
      id: "pad-36",
      path: "t0/d0/pC1",
      mute: true,
    });

    expect(pad.set).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual([
      { id: "pad-36", detail: 'named again as "t0/d0/pC1" later in this call' },
      { id: "pad-36" },
    ]);
  });

  it("runs an action named twice on one device once", () => {
    const simpler = registerMockObject("simpler-1", {
      path: livePath.track(0).device(0),
      type: "SimplerDevice",
      properties: { class_display_name: "Simpler" },
    });

    const result = updateDevice({
      id: "simpler-1",
      actions: ["reverse", "reverse"],
    });

    expect(simpler.call).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({
      id: "simpler-1",
      path: "t0/d0",
      actions: [
        { action: "reverse", detail: "named again later in this call" },
        { action: "reverse" },
      ],
    });
  });

  it("keeps two different devices apart", () => {
    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
    registerMockObject("456", {
      path: livePath.track(0).device(1),
      type: "Device",
    });

    const result = updateDevice({ id: "123", path: "t0/d1", name: "A,B" });

    expect(result).toStrictEqual([
      { id: "123", path: "t0/d0" },
      { id: "456", path: "t0/d1" },
    ]);
  });
});
