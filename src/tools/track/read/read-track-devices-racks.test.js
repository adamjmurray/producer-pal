import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "../../constants.js";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  describe("devices - rack edge cases", () => {
    it("handles empty chains in racks", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "empty_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("rack1"),
        }),
        rack1: {
          name: "My Empty Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("empty_chain"),
          return_chains: [],
        },
        empty_chain: {
          name: "Empty Chain",
          color: 0,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      expect(result.instrument).toEqual({
        id: "rack1",
        name: "My Empty Rack",
        type: "instrument-rack",
        chains: [
          {
            name: "Empty Chain",
            devices: [],
          },
        ],
      });
    });
    it("handles multiple chains in a rack", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 1":
            return "chain2";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "device1";
          case "live_set tracks 0 devices 0 chains 1 devices 0":
            return "device2";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("rack1"),
        }),
        rack1: {
          name: "My Custom Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1", "chain2"),
          return_chains: [],
        },
        chain1: {
          name: "Piano",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("device1"),
        },
        chain2: {
          name: "Bass",
          color: 65280,
          mute: 1,
          muted_via_solo: 0,
          solo: 0,
          devices: children("device2"),
        },
        device1: {
          name: "Lead Synth",
          class_name: "Operator",
          class_display_name: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "Bass Synth",
          class_name: "Wavetable",
          class_display_name: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      expect(result.instrument).toEqual({
        id: "rack1",
        type: "instrument-rack",
        name: "My Custom Rack",
        chains: [
          {
            name: "Piano",
            devices: [
              {
                id: "device1",
                type: "instrument: Operator",
                name: "Lead Synth",
              },
            ],
          },
          {
            name: "Bass",
            state: "muted",
            devices: [
              {
                id: "device2",
                type: "instrument: Wavetable",
                name: "Bass Synth",
              },
            ],
          },
        ],
      });
    });
    it("handles drum rack drum chains with hasSoloedChain property", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 38":
            return "snare_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 38 chains 0":
            return "snare_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad", "snare_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36,
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        snare_pad: {
          name: "Snare",
          note: 38,
          mute: 0,
          solo: 1,
          chains: children("snare_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          muted_via_solo: 1,
          solo: 0,
          devices: children("kick_device"),
        },
        snare_chain: {
          name: "Snare",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 1,
          devices: children("snare_device"),
        },
        kick_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        snare_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
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
      expect(result.instrument).toEqual({
        id: "drum_rack",
        type: "drum-rack",
        name: "My Drums",
        drumPads: [
          {
            name: "Kick",
            note: 36,
            pitch: "C1",
            state: "muted-via-solo",
            chains: [
              {
                name: "Kick",
                state: "muted-via-solo",
                devices: [
                  expect.objectContaining({
                    type: "instrument: Simpler",
                  }),
                ],
              },
            ],
          },
          {
            name: "Snare",
            note: 38,
            pitch: "D1",
            state: "soloed",
            chains: [
              {
                name: "Snare",
                state: "soloed",
                devices: [
                  expect.objectContaining({
                    type: "instrument: Simpler",
                  }),
                ],
              },
            ],
          },
        ],
      });
    });
    it("combines device name and preset name", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2"),
        }),
        device1: {
          name: "Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "My Custom Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });
      expect(result.audioEffects).toEqual([
        {
          id: "device1",
          type: "audio-effect: Reverb",
        },
        {
          id: "device2",
          type: "audio-effect: Reverb",
          name: "My Custom Reverb",
        },
      ]);
    });
  });
});
