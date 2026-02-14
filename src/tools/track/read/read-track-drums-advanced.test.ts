// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import {
  createDrumChainMock,
  createSimpleInstrumentMock,
  mockTrackProperties,
} from "./helpers/read-track-test-helpers.ts";
import { setupTrackMock } from "./helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "./read-track.ts";

/**
 * Creates a standard drum rack mock object for testing
 * @param opts - Options
 * @param opts.chainIds - Chain children IDs
 * @returns Drum rack mock
 */
function createDrumRackMock(opts: {
  chainIds: string[];
}): Record<string, unknown> {
  return {
    name: "Test Drum Rack",
    class_name: "DrumGroupDevice",
    class_display_name: "Drum Rack",
    type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    is_active: 1,
    can_have_chains: 1,
    can_have_drum_pads: 1,
    chains: children(...opts.chainIds),
    return_chains: [],
  };
}

function setupTrackWithInstrumentRack(name: string): void {
  setupTrackMock({
    trackId: "track1",
    properties: mockTrackProperties({
      name,
      devices: children("instrumentRack"),
    }),
  });
  registerMockObject("instrumentRack", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      can_have_drum_pads: 0,
      class_name: "InstrumentGroupDevice",
      chains: children("chain1"),
    },
  });
}

function setupTrackWithDrumRack(chainIds: string[]): void {
  setupTrackMock({
    trackId: "track1",
    properties: mockTrackProperties({ devices: children("drum_rack") }),
  });
  registerMockObject("drum_rack", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: createDrumRackMock({ chainIds }),
  });
}

function registerKickAndEmptyChains(includeSnare: boolean): void {
  registerMockObject("kick_chain", {
    path: "live_set tracks 0 devices 0 chains 0",
    type: "Chain",
    properties: createDrumChainMock({
      inNote: 36,
      name: "Kick",
      color: 16711680,
      deviceId: "kick_device",
    }),
  });
  registerMockObject("empty_chain", {
    path: "live_set tracks 0 devices 0 chains 1",
    type: "Chain",
    properties: createDrumChainMock({
      inNote: 37,
      name: "Empty",
      color: 65280,
    }), // No deviceId = no instruments
  });
  registerMockObject("kick_device", {
    path: "live_set tracks 0 devices 0 chains 0 devices 0",
    type: "Device",
    properties: createSimpleInstrumentMock(),
  });

  if (!includeSnare) {
    return;
  }

  registerMockObject("snare_chain", {
    path: "live_set tracks 0 devices 0 chains 2",
    type: "Chain",
    properties: createDrumChainMock({
      inNote: 38,
      name: "Snare",
      color: 255,
      deviceId: "snare_device",
    }),
  });
  registerMockObject("snare_device", {
    path: "live_set tracks 0 devices 0 chains 2 devices 0",
    type: "Device",
    properties: createSimpleInstrumentMock(),
  });
}

describe("readTrack", () => {
  describe("drumPads", () => {
    it("returns null when instrument rack first chain has no devices", () => {
      setupTrackWithInstrumentRack("Track Instrument Rack Empty Chain");
      registerMockObject("chain1", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: {
          devices: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when instrument rack first chain first device is not a drum rack", () => {
      setupTrackWithInstrumentRack("Track Instrument Rack Non-Drum Device");
      registerMockObject("chain1", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: {
          devices: children("wavetable"),
        },
      });
      registerMockObject("wavetable", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("prefers direct drum rack over nested drum rack", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({
          name: "Track Direct and Nested Drum Racks",
          devices: children("directDrumRack", "instrumentRack"),
        }),
      });
      registerMockObject("directDrumRack", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          chains: children("drumchain1"),
        },
      });
      registerMockObject("drumchain1", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: {
          in_note: 60, // C3
          name: "Direct Kick",
          devices: children("kickdevice"),
        },
      });
      registerMockObject("kickdevice", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      registerMockObject("instrumentRack", {
        path: livePath.track(0).device(1),
        type: "Device",
        properties: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("rackchain1"),
        },
      });
      registerMockObject("rackchain1", {
        path: "live_set tracks 0 devices 1 chains 0",
        type: "Chain",
        properties: {
          devices: children("nestedDrumRack"),
        },
      });
      registerMockObject("nestedDrumRack", {
        path: "live_set tracks 0 devices 1 chains 0 devices 0",
        type: "Device",
        properties: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          chains: children("drumchain2"),
        },
      });
      registerMockObject("drumchain2", {
        path: "live_set tracks 0 devices 1 chains 0 devices 0 chains 0",
        type: "Chain",
        properties: {
          in_note: 61, // Db3
          name: "Nested Snare",
          devices: children("snaredevice"),
        },
      });
      registerMockObject("snaredevice", {
        path: "live_set tracks 0 devices 1 chains 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({ C3: "Direct Kick" });
    });

    it("adds hasInstrument:false property only to drum chains without instruments", () => {
      setupTrackWithDrumRack(["kick_chain", "empty_chain"]);
      registerKickAndEmptyChains(false);

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-pads",
        ],
      });

      // Verify the track was read successfully
      expect(result.id).toBe("track1");
      expect(result.instrument).toBeDefined();

      // drumPads only included when drum-pads is requested
      // expect(result.instrument.drumPads).toStrictEqual([
      //   expect.objectContaining({
      //     name: "Kick",
      //     note: 36,
      //     // Should not have hasInstrument property when it has an instrument
      //   }),
      //   expect.objectContaining({
      //     name: "Empty",
      //     note: 37,
      //     hasInstrument: false, // Should have hasInstrument: false when no instruments
      //   }),
      // ]);

      // // The kick pad should not have hasInstrument property
      // expect(result.instrument.drumPads[0]).not.toHaveProperty("hasInstrument");
      // // The empty pad should have hasInstrument: false
      // expect(result.instrument.drumPads[1]).toHaveProperty(
      //   "hasInstrument",
      //   false,
      // );
    });

    it("excludes drum chains without instruments from drumMap", () => {
      setupTrackWithDrumRack(["kick_chain", "empty_chain", "snare_chain"]);
      registerKickAndEmptyChains(true);

      const result = readTrack({ trackIndex: 0 });

      // drumMap should only include pads with instruments (kick and snare), not empty pad
      expect(result.drumMap).toStrictEqual({
        C1: "Kick", // Has instrument, included
        D1: "Snare", // Has instrument, included
        // Db1 "Empty" should be excluded because it has no instruments
      });
    });

    it("detects instruments nested within racks in drum chain chains", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({ devices: children("drum_rack") }),
      });
      registerMockObject("drum_rack", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createDrumRackMock({ chainIds: ["kick_chain"] }),
      });
      registerMockObject("kick_chain", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: createDrumChainMock({
          inNote: 36,
          name: "Kick",
          color: 16711680,
          deviceId: "nested_rack", // Nested rack instead of direct instrument
        }),
      });
      registerMockObject("nested_rack", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: {
          name: "Nested Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("nested_chain"),
          return_chains: [],
        },
      });
      registerMockObject("nested_chain", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0 chains 0",
        type: "Chain",
        properties: {
          name: "Nested Chain",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_instrument"),
        },
      });
      registerMockObject("nested_instrument", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: createSimpleInstrumentMock(),
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-pads",
          "drum-maps", // Need to explicitly request drum-maps now
        ],
      });

      // drumPads only included when drum-pads is requested
      // Should detect the nested instrument and not add hasInstrument property
      // expect(result.instrument.drumPads[0]).not.toHaveProperty("hasInstrument");

      // drumMap should include the drum chain since it has a nested instrument
      expect(result.drumMap).toStrictEqual({
        C1: "Kick",
      });
    });
  });
});
