// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  ALL_DEVICE_INCLUDE_OPTIONS,
  setupDrumRackMocks,
  setupEmptyRackMocks,
  setupTrackWithDevices,
} from "./helpers/read-track-device-test-helpers.ts";
import { LIVE_API_DEVICE_TYPE_AUDIO_EFFECT } from "#src/tools/constants.ts";
import { readTrack } from "../read-track.ts";

describe("readTrack", () => {
  describe("devices - rack edge cases", () => {
    it("strips chains from rack devices in read-track output", () => {
      setupEmptyRackMocks();

      const result = readTrack({
        trackIndex: 0,
        include: ["devices"],
      });

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(result.devices).toStrictEqual([
        {
          id: "rack1",
          path: "t0/d0",
          name: "My Empty Rack",
          type: "instrument-rack",
        },
      ]);
    });
    it("strips drum rack chains/drumPads in read-track output", () => {
      setupDrumRackMocks();

      const result = readTrack({
        trackIndex: 0,
        include: ["devices", "drum-map"],
      });

      // Chains/drumPads are always stripped in read-track (use read-device for details)
      expect(result.devices).toStrictEqual([
        {
          id: "drum_rack",
          path: "t0/d0",
          type: "drum-rack",
          name: "My Drums",
        },
      ]);
      // drumMap should still be generated
      expect(result.drumMap).toStrictEqual({
        C1: "Kick",
        D1: "Snare",
      });
    });
    it("combines device name and preset name", () => {
      setupTrackWithDevices([
        {
          name: "Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        },
        {
          name: "My Custom Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        },
      ]);

      const result = readTrack({
        trackIndex: 0,
        include: ALL_DEVICE_INCLUDE_OPTIONS,
      });

      expect(result.devices).toStrictEqual([
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
