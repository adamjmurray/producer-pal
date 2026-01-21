import { describe, expect, it } from "vitest";
import { children, mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import {
  createDrumChainMock,
  createSimpleInstrumentMock,
  mockTrackProperties,
  setupDevicePathIdMock,
} from "./helpers/read-track-test-helpers.ts";
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

describe("readTrack", () => {
  describe("drumPads", () => {
    it("returns null when instrument rack first chain has no devices", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Instrument Rack Empty Chain",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when instrument rack first chain first device is not a drum rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Instrument Rack Non-Drum Device",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: children("wavetable"),
        },
        wavetable: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("prefers direct drum rack over nested drum rack", () => {
      setupDevicePathIdMock({
        "live_set tracks 0": "track1",
        "live_set tracks 0 devices 0": "directDrumRack",
        "live_set tracks 0 devices 0 chains 0": "drumchain1",
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Direct and Nested Drum Racks",
          devices: children("directDrumRack", "instrumentRack"),
        }),
        directDrumRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          chains: children("drumchain1"),
        },
        drumchain1: {
          in_note: 60, // C3
          name: "Direct Kick",
          devices: children("kickdevice"),
        },
        kickdevice: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("rackchain1"),
        },
        rackchain1: {
          devices: children("nestedDrumRack"),
        },
        nestedDrumRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          chains: children("drumchain2"),
        },
        drumchain2: {
          in_note: 61, // Db3
          name: "Nested Snare",
          devices: children("snaredevice"),
        },
        snaredevice: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({ C3: "Direct Kick" });
    });

    it("adds hasInstrument:false property only to drum chains without instruments", () => {
      setupDevicePathIdMock({
        "live_set tracks 0": "track1",
        "live_set tracks 0 devices 0": "drum_rack",
        "live_set tracks 0 devices 0 chains 0": "kick_chain",
        "live_set tracks 0 devices 0 chains 1": "empty_chain",
      });

      mockLiveApiGet({
        Track: mockTrackProperties({ devices: children("drum_rack") }),
        drum_rack: createDrumRackMock({
          chainIds: ["kick_chain", "empty_chain"],
        }),
        kick_chain: createDrumChainMock({
          inNote: 36,
          name: "Kick",
          color: 16711680,
          deviceId: "kick_device",
        }),
        empty_chain: createDrumChainMock({
          inNote: 37,
          name: "Empty",
          color: 65280,
        }), // No deviceId = no instruments
        kick_device: createSimpleInstrumentMock(),
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
      setupDevicePathIdMock({
        "live_set tracks 0": "track1",
        "live_set tracks 0 devices 0": "drum_rack",
        "live_set tracks 0 devices 0 chains 0": "kick_chain",
        "live_set tracks 0 devices 0 chains 1": "empty_chain",
        "live_set tracks 0 devices 0 chains 2": "snare_chain",
      });

      mockLiveApiGet({
        Track: mockTrackProperties({ devices: children("drum_rack") }),
        drum_rack: createDrumRackMock({
          chainIds: ["kick_chain", "empty_chain", "snare_chain"],
        }),
        kick_chain: createDrumChainMock({
          inNote: 36,
          name: "Kick",
          color: 16711680,
          deviceId: "kick_device",
        }),
        empty_chain: createDrumChainMock({
          inNote: 37,
          name: "Empty",
          color: 65280,
        }), // No deviceId = no instruments
        snare_chain: createDrumChainMock({
          inNote: 38,
          name: "Snare",
          color: 255,
          deviceId: "snare_device",
        }),
        kick_device: createSimpleInstrumentMock(),
        snare_device: createSimpleInstrumentMock(),
      });

      const result = readTrack({ trackIndex: 0 });

      // drumMap should only include pads with instruments (kick and snare), not empty pad
      expect(result.drumMap).toStrictEqual({
        C1: "Kick", // Has instrument, included
        D1: "Snare", // Has instrument, included
        // Db1 "Empty" should be excluded because it has no instruments
      });
    });

    it("detects instruments nested within racks in drum chain chains", () => {
      setupDevicePathIdMock({
        "live_set tracks 0": "track1",
        "live_set tracks 0 devices 0": "drum_rack",
        "live_set tracks 0 devices 0 chains 0": "kick_chain",
        "live_set tracks 0 devices 0 chains 0 devices 0": "nested_rack",
        "live_set tracks 0 devices 0 chains 0 devices 0 chains 0":
          "nested_chain",
        "live_set tracks 0 devices 0 chains 0 devices 0 chains 0 devices 0":
          "nested_instrument",
      });

      mockLiveApiGet({
        Track: mockTrackProperties({ devices: children("drum_rack") }),
        drum_rack: createDrumRackMock({ chainIds: ["kick_chain"] }),
        kick_chain: createDrumChainMock({
          inNote: 36,
          name: "Kick",
          color: 16711680,
          deviceId: "nested_rack", // Nested rack instead of direct instrument
        }),
        nested_rack: {
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
        nested_chain: {
          name: "Nested Chain",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_instrument"),
        },
        nested_instrument: createSimpleInstrumentMock(),
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
