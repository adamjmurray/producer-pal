// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  ALL_DEVICE_INCLUDE_OPTIONS,
  createChainMockProperties,
  createDeviceMockProperties,
  createRackDeviceMockProperties,
} from "../helpers/read-track-device-test-helpers.ts";
import {
  createDrumChainMock,
  createSimpleInstrumentMock,
} from "../helpers/read-track-test-helpers.ts";
import { setupTrackMock } from "../helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "../read-track.ts";

describe("readTrack", () => {
  describe("devices - rack edge cases", () => {
    it("strips chains from rack devices in read-track output", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("rack1"),
        },
      });
      registerMockObject("rack1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "My Empty Rack",
          className: "InstrumentGroupDevice",
          classDisplayName: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          chainIds: ["empty_chain"],
        }),
      });
      registerMockObject("empty_chain", {
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "Empty Chain",
          color: 0,
          deviceIds: [],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments"],
      });

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(result.instrument).toStrictEqual({
        id: "rack1",
        path: "t0/d0",
        name: "My Empty Rack",
        type: "instrument-rack",
      });
    });
    it("strips drum rack chains/drumPads in read-track output", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("drum_rack"),
        },
      });
      registerMockObject("drum_rack", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: children("kick_chain", "snare_chain"),
          return_chains: [],
        },
      });
      registerMockObject("kick_chain", {
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: createDrumChainMock({
          inNote: 36,
          name: "Kick",
          color: 16711680,
          mutedViaSolo: true,
          deviceId: "kick_device",
        }),
      });
      registerMockObject("snare_chain", {
        path: livePath.track(0).device(0).chain(1),
        type: "Chain",
        properties: createDrumChainMock({
          inNote: 38,
          name: "Snare",
          color: 65280,
          solo: true,
          deviceId: "snare_device",
        }),
      });
      registerMockObject("kick_device", {
        path: livePath.track(0).device(0).chain(0).device(0),
        type: "Device",
        properties: createSimpleInstrumentMock(),
      });
      registerMockObject("snare_device", {
        path: livePath.track(0).device(0).chain(1).device(0),
        type: "Device",
        properties: createSimpleInstrumentMock(),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps"],
      });

      // Chains/drumPads are always stripped in read-track (use read-device for details)
      expect(result.instrument).toStrictEqual({
        id: "drum_rack",
        path: "t0/d0",
        type: "drum-rack",
        name: "My Drums",
      });
      // drumMap should still be generated
      expect(result.drumMap).toStrictEqual({
        C1: "Kick",
        D1: "Snare",
      });
    });
    it("combines device name and preset name", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("device1", "device2"),
        },
      });
      registerMockObject("device1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });
      registerMockObject("device2", {
        path: livePath.track(0).device(1),
        type: "Device",
        properties: createDeviceMockProperties({
          name: "My Custom Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ALL_DEVICE_INCLUDE_OPTIONS,
      });

      expect(result.audioEffects).toStrictEqual([
        {
          id: "device1",
          path: "t0/d0",
          type: "audio-effect: Reverb",
        },
        {
          id: "device2",
          path: "t0/d1",
          type: "audio-effect: Reverb",
          name: "My Custom Reverb",
        },
      ]);
    });
  });
});
