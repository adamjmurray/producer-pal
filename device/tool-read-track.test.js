// device/tool-read-track.test.js
import { describe, expect, it } from "vitest";
import { children, expectedClip, liveApiId, mockLiveApiGet } from "./mock-live-api";
import {
  DEVICE_TYPE_AUDIO_EFFECT,
  DEVICE_TYPE_INSTRUMENT,
  DEVICE_TYPE_MIDI_EFFECT,
  readTrack,
} from "./tool-read-track";

const mockTrackProperties = (overrides = {}) => ({
  name: "Test Track",
  has_midi_input: 1,
  color: 0,
  mute: 0,
  solo: 0,
  arm: 0,
  playing_slot_index: -1,
  fired_slot_index: -1,
  clip_slots: [],
  devices: [],
  ...overrides,
});

describe("readTrack", () => {
  it("returns null values when the track does not exist", () => {
    liveApiId.mockReturnValue("id 0");

    const result = readTrack({ trackIndex: 99 });

    expect(result).toEqual({
      id: null,
      type: null,
      name: null,
      trackIndex: 99,
    });
  });

  it("returns track information for MIDI tracks", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
        playing_slot_index: 2,
        fired_slot_index: 3,
        clip_slots: children("slot1", "slot2"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).toEqual({
      id: "track1",
      type: "midi",
      name: "Track 1",
      trackIndex: 0,
      color: "#FF0000",
      isMuted: false,
      isSoloed: true,
      isArmed: true,
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      drumPads: null,
      clips: [],
    });
  });

  it("returns track information for audio tracks", () => {
    liveApiId.mockReturnValue("track2");
    mockLiveApiGet({
      Track: {
        has_midi_input: 0,
        name: "Audio Track",
        color: 65280, // Green
        mute: 1,
        solo: 0,
        arm: 0,
        playing_slot_index: -1,
        fired_slot_index: -1,
        clip_slots: [],
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 1 });

    expect(result).toEqual({
      id: "track2",
      type: "audio",
      name: "Audio Track",
      trackIndex: 1,
      color: "#00FF00",
      isMuted: true,
      isSoloed: false,
      isArmed: false,
      playingSlotIndex: -1,
      firedSlotIndex: -1,
      drumPads: null,
      clips: [],
    });
  });

  it("returns clip information when the track has clips", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 2":
          return "track3";
        case "live_set tracks 2 clip_slots 0 clip":
          return "clip1";
        case "live_set tracks 2 clip_slots 2 clip":
          return "clip2";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Clips",
        color: 255, // Blue
        mute: 0,
        solo: 0,
        arm: 0,
        playing_slot_index: 0,
        fired_slot_index: -1,
        clip_slots: children("slot1", "slot2", "slot3"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 2 });

    expect(result).toEqual({
      id: "track3",
      type: "midi",
      name: "Track with Clips",
      trackIndex: 2,
      color: "#0000FF",
      isArmed: false,
      isMuted: false,
      isSoloed: false,
      firedSlotIndex: -1,
      playingSlotIndex: 0,
      drumPads: null,
      clips: [expectedClip({ clipSlotIndex: 0 }), expectedClip({ id: "clip2", clipSlotIndex: 2 })],
    });
  });

  describe("drumPads", () => {
    it("returns null when the track has no devices", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track No Devices",
          devices: [],
        }),
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toBeNull();
    });

    it("returns null when the track has devices but no instruments", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track No Instruments",
          devices: children("effect1", "effect2"),
        }),
        effect1: { type: DEVICE_TYPE_AUDIO_EFFECT },
        effect2: { type: DEVICE_TYPE_AUDIO_EFFECT },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toBeNull();
    });

    it("returns null when the track has an instrument but it's not a drum rack", () => {
      liveApiId.mockReturnValue("track6");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Non-Drum Instrument",
          devices: children("wavetable1"),
        }),
        wavetable1: {
          type: DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toBeNull();
    });

    it("returns empty array when the drum rack has no pads", () => {
      liveApiId.mockReturnValue("track7");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Empty Drum Rack",
          devices: children("drumrack"),
        }),
        drumrack: {
          type: DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toEqual([]);
    });

    it("only includes drum pads that have chains to play a sound", () => {
      liveApiId.mockReturnValue("track9");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Drum Rack With Pads",
          devices: children("drumrack"),
        }),
        drumrack: {
          type: DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad1", "pad2", "pad3"),
        },
        pad1: {
          note: 60,
          name: "Kick",
          chains: children("chain1"),
        },
        pad2: {
          note: 62,
          name: "Snare",
          chains: [],
        },
        pad3: {
          note: 64,
          name: "Hi-hat",
          chains: children("chain2"),
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toEqual([
        { pitch: "C3", name: "Kick" },
        { pitch: "E3", name: "Hi-hat" },
      ]);
    });

    it("stops at first drum rack found", () => {
      liveApiId.mockReturnValue("track10");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Multiple Instruments",
          // In theory you could have multiple drum racks in an instrument rack.
          // this is not supported as a feature, but let's make sure something reasonable happens:
          devices: children("midiEffect", "drumrack1", "drumrack2"),
        }),
        midiEffect: { type: DEVICE_TYPE_MIDI_EFFECT },
        drumrack1: {
          type: DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad1"),
        },
        pad1: {
          note: 60,
          name: "First Drum Rack Kick",
          chains: children("chain1"),
        },
        drumrack2: {
          type: DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad2"),
        },
        pad2: {
          note: 61,
          name: "Second Drum Rack Snare",
          chains: children("chain2"),
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumPads).toEqual([{ pitch: "C3", name: "First Drum Rack Kick" }]);
    });
  });
});
